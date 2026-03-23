import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import 'multer';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document, DocumentStatus } from './entities/document.entity';

// ── shared fixtures ────────────────────────────────────────────────────────────

const mockDocument: Document = {
  id: 'doc-uuid-1',
  orgId: 'org-uuid-1',
  uploadedBy: 'user-uuid-1',
  fileUrl: 'uploads/documents/test-file.pdf',
  status: DocumentStatus.PROCESSING,
  createdAt: new Date(),
};

const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'test.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024,
  path: 'uploads/documents/test-1234.pdf',
  destination: 'uploads/documents',
  filename: 'test-1234.pdf',
  buffer: Buffer.alloc(0),
  stream: null as unknown as import('stream').Readable,
};

// ── service mock ───────────────────────────────────────────────────────────────

const uploadMock = jest.fn().mockResolvedValue(mockDocument);
const findAllForOrgMock = jest.fn().mockResolvedValue([mockDocument]);
const removeMock = jest
  .fn()
  .mockResolvedValue({ message: 'Document deleted successfully' });

const mockDocumentsService: Partial<DocumentsService> = {
  upload: uploadMock,
  findAllForOrg: findAllForOrgMock,
  remove: removeMock,
};

// ── helper ─────────────────────────────────────────────────────────────────────

type AuthRequest = Request & { user: { id?: string; sub?: string } };

function makeReq(id: string): AuthRequest {
  return { user: { id } } as AuthRequest;
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('DocumentsController', () => {
  let controller: DocumentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: mockDocumentsService,
        },
      ],
    }).compile();

    controller = module.get<DocumentsController>(DocumentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── uploadDocument ───────────────────────────────────────────────────────────

  describe('uploadDocument', () => {
    it('should delegate to service.upload and return the created document', async () => {
      const dto = { orgId: 'org-uuid-1' };
      const req = makeReq('user-uuid-1');

      const result = await controller.uploadDocument(
        [mockFile] as any,
        dto,
        req,
      );

      expect(uploadMock).toHaveBeenCalledWith(mockFile, req.user, dto);
      expect(result).toEqual(mockDocument);
    });
  });

  // ── listDocuments ────────────────────────────────────────────────────────────

  describe('listDocuments', () => {
    it('should delegate to service.findAllForOrg and return org documents', async () => {
      const req = makeReq('user-uuid-1');
      const orgId = 'org-uuid-1';

      const result = await controller.listDocuments(req, orgId, {
        path: '',
      } as any);

      expect(findAllForOrgMock).toHaveBeenCalledWith(req.user, orgId);
      expect(result).toEqual([mockDocument]);
    });
  });

  // ── deleteDocument ───────────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('should delegate to service.remove and return a success message', async () => {
      const req = makeReq('user-uuid-1');
      const id = 'doc-uuid-1';

      const result = await controller.deleteDocument(id, req, 'test-org-id');

      expect(removeMock).toHaveBeenCalledWith(id, req.user);
      expect(result).toEqual({ message: 'Document deleted successfully' });
    });
  });
});
