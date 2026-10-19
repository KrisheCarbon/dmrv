import { BadRequestException } from '@nestjs/common';

export const TRAINING_BUCKET = 'training-sessions';
export const INSPECTION_BUCKET = 'inspections';

const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const MAX_FILES = 20;

export interface StoredFileInput {
  kind: string;
  path: string;
  file_name: string;
  content_type: string;
}

export interface StoredFileRecord {
  id: string;
  kind: string;
  bucket: string;
  path: string;
  file_name: string;
  content_type: string;
  signed_url: string | null;
}

export function assertFiles(args: {
  files: StoredFileInput[];
  userId: string;
  bucket: string;
  allowed: Record<string, readonly string[]>;
  required: string[];
  exactlyOne?: string[];
}): StoredFileInput[] {
  if (!Array.isArray(args.files) || args.files.length === 0) {
    throw new BadRequestException('Upload the required files.');
  }
  if (args.files.length > MAX_FILES) {
    throw new BadRequestException(`Upload at most ${MAX_FILES} files.`);
  }

  const cleaned = args.files.map((file) => {
    const kind = typeof file.kind === 'string' ? file.kind : '';
    const types = args.allowed[kind];
    if (!types) throw new BadRequestException('One of the files has an unknown kind.');
    const contentType = typeof file.content_type === 'string' ? file.content_type : '';
    if (!types.includes(contentType)) {
      throw new BadRequestException(`That file type is not allowed for ${kind}.`);
    }
    const path = typeof file.path === 'string' ? file.path : '';
    if (!path.startsWith(`${args.userId}/`) || path.includes('..') || path.length > 400) {
      throw new BadRequestException('A file was not uploaded from this account.');
    }
    const fileName = typeof file.file_name === 'string' ? file.file_name.trim() : '';
    if (!fileName || fileName.length > 180) {
      throw new BadRequestException('Each file needs a name.');
    }
    return { kind, path, file_name: fileName, content_type: contentType };
  });

  for (const kind of args.required) {
    if (!cleaned.some((file) => file.kind === kind)) {
      throw new BadRequestException(requiredMessage(kind));
    }
  }
  for (const kind of args.exactlyOne ?? []) {
    const count = cleaned.filter((file) => file.kind === kind).length;
    if (count !== 1) throw new BadRequestException(requiredMessage(kind));
  }
  return cleaned;
}

function requiredMessage(kind: string): string {
  if (kind === 'attendance') return 'Upload at least one attendance sheet.';
  if (kind === 'photo') return 'Upload at least one photo.';
  if (kind === 'report') return 'Upload the inspection report.';
  return `Upload the required ${kind} file.`;
}

export function docTypes(): readonly string[] {
  return DOC_TYPES;
}

export function photoTypes(): readonly string[] {
  return PHOTO_TYPES;
}

export function videoTypes(): readonly string[] {
  return VIDEO_TYPES;
}
