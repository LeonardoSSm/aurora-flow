import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { ACCESS_TOKEN_KEY, renewSession } from '../api/client';
import type { LocalFile } from '../api/types';
import { API_BASE_URL } from '../config/environment';

/*
 * Arquivos no aparelho: escolher (câmera, galeria, documento), otimizar foto, baixar com o login
 * (o app antigo abria a URL do anexo no navegador, sem token — dava 401) e abrir no visualizador.
 */

/** Lado maior de uma foto otimizada — o mesmo do web (dá para ler etiqueta e nota fiscal). */
const IMAGE_MAX_DIMENSION = 2560;
const JPEG_QUALITY = 0.82;
const MIN_BYTES_TO_OPTIMIZE = 300 * 1024;

export function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Foto grande vira JPEG de até 2560 px (como no web); foto pequena passa como está. */
async function optimizeImage(asset: ImagePicker.ImagePickerAsset): Promise<LocalFile> {
  const name = asset.fileName ?? `foto_${stamp()}.jpg`;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const size = asset.fileSize ?? undefined;
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
  const needs = (size === undefined || size > MIN_BYTES_TO_OPTIMIZE) && (longest > IMAGE_MAX_DIMENSION || mimeType !== 'image/png');
  if (!needs || mimeType === 'image/gif') return { uri: asset.uri, name, mimeType, size };
  try {
    const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    if (longest > IMAGE_MAX_DIMENSION) {
      context.resize(
        (asset.width ?? 0) >= (asset.height ?? 0) ? { width: IMAGE_MAX_DIMENSION } : { height: IMAGE_MAX_DIMENSION },
      );
    }
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG });
    let optimizedSize: number | undefined;
    try {
      optimizedSize = new File(result.uri).size ?? undefined;
    } catch {
      optimizedSize = undefined;
    }
    // Só fica com a otimizada se ela de fato ficou menor.
    if (size !== undefined && optimizedSize !== undefined && optimizedSize >= size) return { uri: asset.uri, name, mimeType, size };
    return { uri: result.uri, name: `${splitFileName(name).base}.jpg`, mimeType: 'image/jpeg', size: optimizedSize };
  } catch {
    return { uri: asset.uri, name, mimeType, size };
  }
}

export type PickSource = 'camera' | 'gallery' | 'document';

export class PermissionDeniedError extends Error {}

/** Abre a câmera, a galeria ou o seletor de documentos. `null` = a pessoa desistiu. */
export async function pickFiles(source: PickSource, multiple = true): Promise<LocalFile[] | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PermissionDeniedError('Permita o acesso à câmera nas configurações do aparelho.');
    const result = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false });
    if (result.canceled || result.assets.length === 0) return null;
    return Promise.all(result.assets.map(optimizeImage));
  }
  if (source === 'gallery') {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: multiple,
      selectionLimit: multiple ? 10 : 1,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return Promise.all(result.assets.map(optimizeImage));
  }
  const result = await DocumentPicker.getDocumentAsync({ multiple, copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.size ?? undefined,
  }));
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'arquivo';
}

/**
 * Baixa um arquivo da API com o login da pessoa (renova o token uma vez se ele venceu) e devolve
 * o caminho local no cache do app.
 */
export async function downloadToCache(path: string, fileName: string, authenticated = true) {
  const target = new File(Paths.cache, `${Date.now()}_${safeName(fileName)}`);
  const url = `${API_BASE_URL}${path}`;
  const attempt = async () => {
    const headers: Record<string, string> = {};
    if (authenticated) {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return File.downloadFileAsync(url, target, { headers, idempotent: true });
  };
  try {
    return await attempt();
  } catch (error) {
    if (authenticated && String(error).includes('401')) {
      await renewSession();
      return attempt();
    }
    throw error;
  }
}

/** Abre o arquivo baixado no app do aparelho que sabe mostrá-lo (PDF, imagem, planilha). */
export async function openLocalFile(file: { uri: string; contentUri: string }, mimeType: string): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: file.contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: mimeType || 'application/octet-stream',
      });
      return;
    } catch {
      // Nenhum app abre esse tipo: cai no compartilhar (salvar, enviar).
    }
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: mimeType || undefined, dialogTitle: 'Abrir arquivo' });
    return;
  }
  throw new Error('Nenhum aplicativo para abrir este arquivo.');
}

export async function shareLocalFile(file: { uri: string }, mimeType: string): Promise<void> {
  await Sharing.shareAsync(file.uri, { mimeType: mimeType || undefined, dialogTitle: 'Compartilhar arquivo' });
}

export function isImageMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

export function fileIcon(mimeType: string | null | undefined): 'image' | 'file-text' | 'file' | 'film' | 'grid' {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'film';
  if (mimeType.includes('pdf') || mimeType.startsWith('text/') || mimeType.includes('word')) return 'file-text';
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'grid';
  return 'file';
}
