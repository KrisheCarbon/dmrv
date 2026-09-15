/**
 * Generated placeholder assets, used wherever the schema wants a photo/PDF that
 * the Kobo dataset does not have (kontikki top/side photos, kiln plan PDFs,
 * feedstock lab reports) or where a Kobo attachment cannot be fetched.
 *
 * Each is uploaded once to <bucket>/migration-dummy/ and the same URL is reused
 * everywhere, so this adds 2 objects total rather than thousands.
 */

import { uploadObject, publicUrl } from './common.mjs';

/** 1x1 grey JPEG, ~630 bytes. Valid image, renders in any viewer. */
const DUMMY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
  'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
  'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
  'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
  'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
  'gD//2Q==';

/** Minimal single-page PDF saying it is test data. */
const DUMMY_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 96>>stream
BT /F1 16 Tf 60 760 Td (PLACEHOLDER - MIGRATION TEST DATA) Tj ET
BT /F1 11 Tf 60 730 Td (Not a real document.) Tj ET
endstream
endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`;

const DUMMY_DIR = 'migration-dummy';
const cache = new Map();

async function ensure(bucket, filename, bytes, contentType) {
  const key = `${bucket}/${filename}`;
  if (cache.has(key)) return cache.get(key);
  const path = `${DUMMY_DIR}/${filename}`;
  let url;
  try {
    url = await uploadObject(bucket, path, bytes, contentType);
  } catch (e) {
    // Bucket may not exist / be writable — fall back to the URL form so the
    // migration still completes and the gap is visible in verification.
    url = publicUrl(bucket, path);
  }
  cache.set(key, url);
  return url;
}

export function dummyImageBytes() {
  return Buffer.from(DUMMY_JPEG_B64, 'base64');
}

export function dummyPdfBytes() {
  return Buffer.from(DUMMY_PDF, 'utf8');
}

export async function dummyImageUrl(bucket) {
  return ensure(bucket, 'placeholder.jpg', dummyImageBytes(), 'image/jpeg');
}

export async function dummyPdfUrl(bucket) {
  return ensure(bucket, 'placeholder.pdf', dummyPdfBytes(), 'application/pdf');
}
