import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Db, MongoClient } from 'mongodb';
import { paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { MembershipService } from 'src/membership/membership.service';
import { Repository } from 'typeorm';
import { Document } from '../documents/entities/document.entity';
import { ChatMessage } from './dto/chat-message.entity';
import { ChatSession } from './dto/chat-session.entity';
import { AskQuestionDto } from './dto/chat.dto';

@Injectable()
export class ChatService implements OnModuleInit {
  @InjectRepository(ChatSession)
  private readonly sessionRepository: Repository<ChatSession>;
  @InjectRepository(ChatMessage)
  private readonly messageRepository: Repository<ChatMessage>;

  private readonly openRouterApiKey: string;
  private readonly mongoUri: string;
  private mongoClient: MongoClient | null = null;
  private mongoDb: Db | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly membershipService: MembershipService,
  ) {
    this.openRouterApiKey =
      this.configService.get<string>('OPENROUTER_API_KEY') ||
      process.env.OPENROUTER_API_KEY ||
      '';
    this.mongoUri =
      this.configService.get<string>('MONGODB_URI') ||
      process.env.MONGODB_URI ||
      '';
  }

  async onModuleInit() {
    try {
      const db = await this.getMongoDb();
      await db.collection('document_embeddings').createIndex({ text: 'text' });
    } catch (error) {
      console.error(
        'Failed to connect to MongoDB or create index on startup:',
        error,
      );
    }
  }

  private async getMongoDb(): Promise<Db> {
    if (this.mongoDb) return this.mongoDb;
    if (!this.mongoUri)
      throw new Error('MONGODB_URI is not set in environment');

    this.mongoClient = new MongoClient(this.mongoUri);
    await this.mongoClient.connect();

    this.mongoDb = this.mongoClient.db();
    return this.mongoDb;
  }

  /**
   * Helper function to perform Reciprocal Rank Fusion (RRF)
   */
  private applyRRF(vectorResults: any[], keywordResults: any[], k = 60) {
    const scores = new Map<string, { score: number; item: any }>();

    // Process vector search results
    vectorResults.forEach((item, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      scores.set(item._id.toString(), { score: rrfScore, item });
    });

    // Process keyword search results
    keywordResults.forEach((item, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);

      if (scores.has(item._id.toString())) {
        const existing = scores.get(item._id.toString());
        if (existing) {
          existing.score += rrfScore;
        }
      } else {
        scores.set(item._id.toString(), { score: rrfScore, item });
      }
    });

    // Sort by combined RRF score descending
    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map((entry) => ({
        ...entry.item,
        hybridScore: entry.score,
        score: entry.score, // Keep score field for existing logic
      }));
  }

  async previousConvoFromSession(
    userId: string,
    orgId: string,
    sessionId: string,
    query: PaginateQuery,
  ): Promise<Paginated<ChatMessage> | undefined> {
    const membership = await this.membershipService.findByUserIdAndOrgId(
      userId,
      orgId,
    );
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    return paginate(query, this.messageRepository, {
      sortableColumns: ['createdAt'],
      defaultSortBy: [['createdAt', 'DESC']],
      where: {
        session: {
          id: sessionId,
          userId,
          orgId,
        },
      },
    });
  }

  async askQuestion(userId: string, dto: AskQuestionDto) {
    const { orgId, question } = dto;

    let embedding: number[];
    let session: ChatSession | null;

    if (dto.sessionId) {
      session = await this.sessionRepository.findOne({
        where: {
          id: dto.sessionId,
          userId,
        },
      });
      if (!session) throw new NotFoundException('Chat Session not found');
    } else {
      session = this.sessionRepository.create({
        userId,
        orgId,
      });
      await this.sessionRepository.save(session);
    }

    const userMessage = this.messageRepository.create({
      session,
      role: 'user',
      content: question,
    });
    await this.messageRepository.save(userMessage);

    const previousMessages = await this.messageRepository.find({
      where: {
        session: {
          id: session.id,
        },
      },
      order: {
        createdAt: 'DESC',
      },
      take: 6,
    });

    const chatHistory = previousMessages.reverse().map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/embeddings',
        {
          model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
          input: question,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer':
              process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'crag-backend',
          },
          timeout: 30000,
        },
      );

      embedding = response?.data?.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from OpenRouter');
      }
    } catch (error: any) {
      console.error(
        'OpenRouter Embeddings API Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Failed to generate embedding for the question.',
      );
    }

    const db = await this.getMongoDb();
    const collection = db.collection('document_embeddings');

    const [vectorResults, keywordResults] = await Promise.all([
      // Semantic Search (Vector)
      collection
        .aggregate([
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: embedding,
              numCandidates: 100,
              limit: 2,
              filter: { orgId: orgId },
            },
          },
          {
            $project: {
              _id: 1,
              text: 1,
              documentId: 1,
              pageNumber: 1,
              documentName: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ])
        .toArray(),

      // Keyword Search (Text Index)
      collection
        .find(
          {
            $text: { $search: question },
            orgId: orgId,
          },
          {
            projection: {
              _id: 1,
              text: 1,
              documentId: 1,
              pageNumber: 1,
              documentName: 1,
              score: { $meta: 'textScore' },
            },
          },
        )
        .sort({ score: { $meta: 'textScore' } })
        .limit(10)
        .toArray(),
    ]);

    let searchResults = this.applyRRF(vectorResults, keywordResults);

    searchResults = searchResults.slice(0, 5);
    const context = searchResults
      .map((row: any) => row.text)
      .join('\n\n---\n\n');

    const messages = [
      {
        role: 'system',
        content: `You are a highly accurate and concise assistant. Answer using ONLY the provided context. If the answer cannot be found in the context, say exactly "I don't know.". Do not hallucinate or guess. Return ONLY one final answer.\n\nContext:\n${context}`,
      },

      {
        role: 'user',
        content: question,
      },
      ...chatHistory,
    ];

    //console.log(messages);

    const uniqueDocs = new Map<
      string,
      { documentName: string; snippet: string; highlight: string }
    >();

    const queryWords = new Set(
      question
        .toLowerCase()
        .split(/W+/)
        .filter((w) => w.length > 3),
    );

    for (const chunk of searchResults as Array<{
      documentId: string;
      documentName?: string;
      text?: string;
    }>) {
      if (!uniqueDocs.has(chunk.documentId)) {
        const fullText = chunk.text || '';
        const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];

        let bestSentence = sentences[0] || '';
        let maxMatches = -1;

        for (const sentence of sentences) {
          const words = sentence.toLowerCase().split(/W+/);
          const matches = words.filter((w) => queryWords.has(w)).length;
          if (matches > maxMatches) {
            maxMatches = matches;
            bestSentence = sentence;
          }
        }

        const highlight = bestSentence.trim();
        const cleanedText = fullText.replace(/\n+/g, ' ');
        const snippetText =
          cleanedText.length > 200
            ? `${cleanedText.slice(0, 200)}...`
            : cleanedText;

        uniqueDocs.set(chunk.documentId, {
          documentName: chunk.documentName || 'Unknown Document',
          snippet: snippetText,
          highlight:
            highlight.length > 150
              ? `${highlight.slice(0, 150)}...`
              : highlight,
        });
      }
    }
    const sources = Array.from(uniqueDocs.values());
    // Normalize RRF scores (which are very small decimals) to a 0.0 - 0.99 range
    const confidence =
      searchResults.length > 0
        ? Number(
            (
              searchResults.reduce(
                (acc, curr) => acc + Math.min((curr.score || 0) * 60, 0.99),
                0,
              ) / searchResults.length
            ).toFixed(2),
          )
        : 0;

    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer':
              process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'crag-backend',
          },
          body: JSON.stringify({
            model: 'nvidia/nemotron-3-super-120b-a12b:free',
            messages: messages,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const completion = await response.json();

      const aiMessage = this.messageRepository.create({
        session: session,
        role: 'assistant',
        content: completion.choices[0].message.content,
      });
      await this.messageRepository.save(aiMessage);

      return {
        sessionId: session.id,
        answer: aiMessage.content,
        confidence,
        sources: sources,
      };
    } catch (error) {
      try {
        console.log(error);
        const fallbackResponse = await fetch(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.openRouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer':
                process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
              'X-Title': process.env.OPENROUTER_APP_NAME || 'crag-backend',
            },
            body: JSON.stringify({
              model: 'meta-llama/llama-3.2-3b-instruct:free',
              messages: messages,
            }),
          },
        );

        if (!fallbackResponse.ok) {
          throw new Error(`HTTP error! status: ${fallbackResponse.status}`);
        }

        const fallback = await fallbackResponse.json();

        return {
          answer: fallback.choices[0].message.content,
          confidence,
          sources: sources,
          modelUsed: 'meta-llama/llama-3.2-3b-instruct:free',
        };
      } catch (fallbackError) {
        throw new InternalServerErrorException(
          'Failed to generate answer from LLM providers.',
        );
      }
    }
  }
}
