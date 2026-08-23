import { google } from 'googleapis';

// Acceso por service account: compartir las carpetas del Drive con el
// client_email de la SA como Lector. Sin OAuth ni refresh tokens.
type Credenciales = { client_email?: string; private_key?: string };

// Un JSON.parse pelado sobre la variable de entorno explota con un SyntaxError
// ilegible cuando el valor esta mal pegado, que es el error mas facil de cometer
// al cargarlo a mano. Preferimos un mensaje que diga que revisar.
function credenciales(): Credenciales {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!bruto?.trim()) {
    throw new Error('Falta la variable GOOGLE_SERVICE_ACCOUNT_JSON en Vercel.');
  }

  // Las comillas que envuelven el valor en .env.example no van en el panel de Vercel.
  let texto = bruto.trim();
  const comilla = texto[0];
  if ((comilla === "'" || comilla === '"') && texto.endsWith(comilla)) {
    texto = texto.slice(1, -1).trim();
  }

  let creds: Credenciales;
  try {
    creds = JSON.parse(texto);
  } catch {
    // Solo los primeros caracteres: alcanza para diagnosticar y no filtra la clave.
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON no es JSON valido (empieza con "${texto.slice(0, 8)}…", ${texto.length} caracteres). ` +
      'Tiene que ser el contenido completo del archivo de la clave, desde la primera { hasta la ultima }.',
    );
  }

  if (!creds.client_email || !creds.private_key) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON es JSON pero no tiene client_email y private_key: ' +
      'no es el archivo de la clave de la service account.',
    );
  }
  return creds;
}

function client() {
  const auth = new google.auth.GoogleAuth({
    credentials: credenciales(),
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
