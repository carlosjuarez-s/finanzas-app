import { google } from 'googleapis';

// Acceso por service account: compartir las carpetas del Drive con el
// client_email de la SA como Lector. Sin OAuth ni refresh tokens.
function client() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function findFolder(name: string): Promise<string | null> {
  const drive = client();
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name contains '${name.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id,name)',
    pageSize: 5,
  });
  return res.data.files?.[0]?.id ?? null;
}

export async function listPdfs(folderId: string) {
  const drive = client();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  });
  return res.data.files ?? [];
}

export async function downloadBase64(fileId: string): Promise<string> {
  const drive = client();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer).toString('base64');
}
