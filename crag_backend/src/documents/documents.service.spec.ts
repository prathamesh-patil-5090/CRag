import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import 'multer';
import { MembershipService } from 'src/membership/membership.service';
import { DocumentsService } from './documents.service';
import { Document, DocumentStatus } from './entities/document.entity';

const mockDocument: Document = {
  id: 'doc-uuid-1',
  orgId: 'org-uuid-1',
  uploadedBy: 'user-uuid-1',
  fileUrl: 'uploads/documents/test-1234.pdf',
  status: DocumentStatus.PROCESSING,
  createdAt: new Date(),
};

const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'test.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 2048,
  path: 'uploads/documents/test-1234.pdf',
  destination: 'uploads/documents',
  filename: 'test-1234.pdf',
  buffer: Buffer.alloc(0),
  stream: null as unknown as import('stream').Readable,
};

// ── repo mock ──────────────────────────────────────────────────────────────────
const createMock = jest.fn().mockReturnValue(mockDocument);
const saveMock = jest.fn().mockResolvedValue(mockDocument);
const findMock = jest.fn().mockResolvedValue([mockDocument]);
const findOneMock = jest.fn().mockResolvedValue(mockDocument);
const deleteMock = jest.fn().mockResolvedValue({ affected: 1 });

const mockDocumentRepo = {
  create: createMock,
  save: saveMock,
  find: findMock,
  findOne: findOneMock,
  delete: deleteMock,
};

// ── membership mock ────────────────────────────────────────────────────────────
const findByUserIdAndOrgIdMock = jest
  .fn()
  .mockResolvedValue({ id: 'membership-uuid-1', role: 'MEMBER' });

const mockMembershipService = {
  findByUserIdAndOrgId: findByUserIdAndOrgIdMock,
};

// ── queue mock ─────────────────────────────────────────────────────────────────
const queueAddMock = jest.fn().mockResolvedValue({ id: 'job-1' });

const mockDocumentsQueue = {
  add: queueAddMock,
};

// ──────────────────────────────────────────────────────────────────────────────

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getRepositoryToken(Document),
          useValue: mockDocumentRepo,
        },
        {
          provide: MembershipService,
          useValue: mockMembershipService,
        },
        {
          provide: getQueueToken('documents'),
          useValue: mockDocumentsQueue,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── upload ─────────────────────────────────────────────────────────────────

  describe('upload', () => {
    const user = { id: 'user-uuid-1' };
    const dto = { orgId: 'org-uuid-1' };

    it('should create a document record and enqueue a job', async () => {
      const result = await service.upload(mockFile, user, dto);

      expect(findByUserIdAndOrgIdMock).toHaveBeenCalledWith(
        'user-uuid-1',
        'org-uuid-1',
      );
      expect(createMock).toHaveBeenCalledWith({
        orgId: 'org-uuid-1',
        uploadedBy: 'user-uuid-1',
        fileUrl: mockFile.path,
        status: DocumentStatus.PROCESSING,
      });
      expect(saveMock).toHaveBeenCalledWith(mockDocument);
      expect(queueAddMock).toHaveBeenCalledWith('process-document', {
        documentId: mockDocument.id,
      });
      expect(result).toEqual(mockDocument);
    });

    it('should throw BadRequestException when no file is provided', async () => {
      await expect(service.upload(undefined, user, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException when user context is missing', async () => {
      await expect(service.upload(mockFile, {}, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when user is not a member of the org', async () => {
      findByUserIdAndOrgIdMock.mockResolvedValueOnce(null);

      await expect(service.upload(mockFile, user, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── findAllForOrg ──────────────────────────────────────────────────────────

  describe('findAllForOrg', () => {
    const user = { id: 'user-uuid-1' };
    const orgId = 'org-uuid-1';

    it('should return all documents belonging to the org', async () => {
      const result = await service.findAllForOrg(user, orgId);

      expect(findByUserIdAndOrgIdMock).toHaveBeenCalledWith(
        'user-uuid-1',
        orgId,
      );
      expect(findMock).toHaveBeenCalledWith({
        where: { orgId },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual([mockDocument]);
    });

    it('should throw ForbiddenException when user context is missing', async () => {
      await expect(service.findAllForOrg({}, orgId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when user is not a member of the org', async () => {
      findByUserIdAndOrgIdMock.mockResolvedValueOnce(null);

      await expect(service.findAllForOrg(user, orgId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    const user = { id: 'user-uuid-1' };
    const documentId = 'doc-uuid-1';

    it('should delete the document and return a success message', async () => {
      const result = await service.remove(documentId, user);

      expect(findOneMock).toHaveBeenCalledWith({
        where: { id: documentId },
      });
      expect(findByUserIdAndOrgIdMock).toHaveBeenCalledWith(
        'user-uuid-1',
        mockDocument.orgId,
      );
      expect(deleteMock).toHaveBeenCalledWith(documentId);
      expect(result).toEqual({ message: 'Document deleted successfully' });
    });

    it('should throw NotFoundException when document does not exist', async () => {
      findOneMock.mockResolvedValueOnce(null);

      await expect(service.remove(documentId, user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user context is missing', async () => {
      await expect(service.remove(documentId, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when user is not a member of the org', async () => {
      findByUserIdAndOrgIdMock.mockResolvedValueOnce(null);

      await expect(service.remove(documentId, user)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
