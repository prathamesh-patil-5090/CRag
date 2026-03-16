import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage, StorageEngine } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

const DOCUMENT_UPLOAD_PATH = join(process.cwd(), 'uploads', 'documents');

const ensureUploadPath = (): void => {
  if (!existsSync(DOCUMENT_UPLOAD_PATH)) {
    mkdirSync(DOCUMENT_UPLOAD_PATH, { recursive: true });
  }
};

type DiskCb = (error: Error | null, result: string) => void;

const documentStorage: StorageEngine = diskStorage({
  destination(
    _req: Express.Request,
    _file: Express.Multer.File,
    cb: DiskCb,
  ): void {
    ensureUploadPath();
    cb(null, DOCUMENT_UPLOAD_PATH);
  },
  filename(_req: Express.Request, file: Express.Multer.File, cb: DiskCb): void {
    const ext = extname(file.originalname);
    const baseName = file.originalname.replace(ext, '');
    const sanitized = baseName.replace(/\s+/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${sanitized}-${uniqueSuffix}${ext}`);
  },
});

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('file', 10, { storage: documentStorage }))
  uploadDocument(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateDocumentDto,
    @Req() req: Request & { user: { id?: string; sub?: string } },
  ) {
    return this.documentsService.upload(files, req.user, dto);
  }

  @Post('upload/company')
  @UseInterceptors(FilesInterceptor('file', 10, { storage: documentStorage }))
  uploadCompanyDocument(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateDocumentDto,
    @Req() req: Request & { user: { id?: string; sub?: string } },
  ) {
    return this.documentsService.uploadCompanyDocs(files, req.user, dto);
  }

  @Get()
  listDocuments(
    @Req() req: Request & { user: { id?: string; sub?: string } },
    @Query('orgId', new ParseUUIDPipe()) orgId: string,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.documentsService.findAllForOrg(userId as string, orgId);
  }

  @Delete(':id')
  deleteDocument(
    @Req() req: Request & { user: { id?: string; sub?: string } },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.documentsService.remove(id, req.user);
  }
}
