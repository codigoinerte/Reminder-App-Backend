/**
 * Cliente de Evolution API (canal WHATSAPP-BAILEYS).
 *
 * Multi-usuario: cada función recibe el `instanceName` del usuario
 * (whatsapp-scheduler-{numero}). La app nunca habla con Evolution directamente.
 */
import { config } from './config.js';

const { baseUrl, apiKey } = config.evolution;

async function evo<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? safeJson(text) : undefined;
  if (!res.ok) {
    throw new Error(
      `Evolution ${res.status} en ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type ConnectionState = 'connecting' | 'open' | 'close' | 'unknown';

export type CreateInstanceResult = {
  pairingCode?: string;
  instanceId?: string;
  instanceHash?: string;
  state: ConnectionState;
};

/**
 * Crea la instancia del usuario pasando su número para obtener el pairing code.
 * Si ya existe, recupera el code vía connect.
 */
export async function createInstance(
  instanceName: string,
  number: string
): Promise<CreateInstanceResult> {
  let res: any;
  try {
    res = await evo<any>('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        number,
      }),
    });
  } catch {
    const code = await connect(instanceName, number);
    return { pairingCode: code ?? undefined, state: 'connecting' };
  }

  return {
    pairingCode: res?.qrcode?.pairingCode ?? undefined,
    instanceId: res?.instance?.instanceId ?? undefined,
    instanceHash:
      res?.hash?.apikey ?? res?.hash ?? res?.instance?.hash ?? undefined,
    state: (res?.instance?.state as ConnectionState) ?? 'connecting',
  };
}

/** Recupera el pairing code de una instancia existente no conectada. */
export async function connect(
  instanceName: string,
  number: string
): Promise<string | null> {
  try {
    const res = await evo<any>(
      `/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(number)}`
    );
    return res?.pairingCode ?? res?.code ?? null;
  } catch {
    return null;
  }
}

export async function getConnectionState(
  instanceName: string
): Promise<ConnectionState> {
  try {
    const res = await evo<any>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`
    );
    return (res?.instance?.state as ConnectionState) ?? 'unknown';
  } catch {
    return 'close';
  }
}

export async function logout(instanceName: string): Promise<void> {
  await evo<void>(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await evo<void>(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
}

/** Envía un mensaje de texto. number en formato 51999999999 (sin + ni @). */
export async function sendText(
  instanceName: string,
  number: string,
  text: string
): Promise<void> {
  await evo<unknown>(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    }
  );
}
