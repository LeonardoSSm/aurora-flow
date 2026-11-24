import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_MAX_DIMENSION,
  appendUploadLabel,
  createPendingUpload,
  fileLabelRequired,
  isUploadLabeled,
  optimizeImageFile,
  prepareUploads,
  splitFileName,
  uploadLabel,
} from './attachment-upload';

describe('splitFileName', () => {
  it('separa a última extensão', () => {
    expect(splitFileName('Nota fiscal.v2.pdf')).toEqual({ base: 'Nota fiscal.v2', ext: '.pdf' });
  });
  it('sem extensão, ponto inicial ou ponto final = tudo é nome', () => {
    expect(splitFileName('LEIAME')).toEqual({ base: 'LEIAME', ext: '' });
    expect(splitFileName('.env')).toEqual({ base: '.env', ext: '' });
    expect(splitFileName('arquivo.')).toEqual({ base: 'arquivo.', ext: '' });
  });
});

describe('nome ou descrição obrigatórios', () => {
  const photo = new File(['x'], 'IMG_0001.jpg', { type: 'image/jpeg' });

  it('arquivo recém-escolhido não está identificado', () => {
    expect(isUploadLabeled(createPendingUpload(photo))).toBe(false);
  });

  it('renomear ou descrever basta; só espaços não conta', () => {
    const upload = createPendingUpload(photo);
    expect(isUploadLabeled({ ...upload, name: 'Etiqueta' })).toBe(true);
    expect(isUploadLabeled({ ...upload, description: 'Frente da caixa' })).toBe(true);
    expect(isUploadLabeled({ ...upload, name: '  IMG_0001 ' })).toBe(false);
    expect(isUploadLabeled({ ...upload, name: '', description: '   ' })).toBe(false);
  });

  it('envia o nome só quando mudou, e a descrição aparada', () => {
    const upload = createPendingUpload(photo);
    expect(uploadLabel(upload)).toEqual({});
    expect(uploadLabel({ ...upload, name: ' Etiqueta ', description: ' lote 12 ' })).toEqual({
      name: 'Etiqueta',
      description: 'lote 12',
    });
    expect(uploadLabel({ ...upload, description: 'só descrição' })).toEqual({ description: 'só descrição' });
  });

  it('appendUploadLabel põe os campos de texto no multipart', () => {
    const form = new FormData();
    appendUploadLabel(form, { name: 'Contrato', description: 'Assinado' });
    expect(form.get('name')).toBe('Contrato');
    expect(form.get('description')).toBe('Assinado');
    const empty = new FormData();
    appendUploadLabel(empty, {});
    expect(empty.has('name')).toBe(false);
  });

  it('campo sem a chave exige; só false desliga', () => {
    expect(fileLabelRequired(undefined)).toBe(true);
    expect(fileLabelRequired({})).toBe(true);
    expect(fileLabelRequired({ requireFileLabel: true })).toBe(true);
    expect(fileLabelRequired({ requireFileLabel: false })).toBe(false);
  });
});

describe('optimizeImageFile', () => {
  const big = (type: string, name: string) => new File([new Uint8Array(2 * 1024 * 1024)], name, { type });

  type FakeCtx = {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    getImageData: ReturnType<typeof vi.fn>;
    fillStyle: string;
  };

  function mockCanvas({ opaque = true, blobBytes = 200 * 1024 } = {}) {
    const ctx: FakeCtx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      fillStyle: '',
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, opaque ? 255 : 10]),
      })),
    };
    const sizes: Array<{ width: number; height: number; type?: string; quality?: number }> = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      sizes.push({ width: this.width, height: this.height, type, quality });
      callback(new Blob([new Uint8Array(blobBytes)], { type }));
    });
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 5120, height: 3840, close }));
    return { ctx, sizes, close };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reduz o lado maior para o limite e regrava em JPEG', async () => {
    const { sizes, close } = mockCanvas();
    const result = await optimizeImageFile(big('image/jpeg', 'IMG_0001.jpg'));

    expect(sizes).toEqual([{ width: IMAGE_MAX_DIMENSION, height: 1920, type: 'image/jpeg', quality: 0.82 }]);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('IMG_0001.jpg');
    expect(result.size).toBe(200 * 1024);
    expect(close).toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: 'from-image' });
  });

  it('PNG sem transparência vira JPEG (com fundo branco)', async () => {
    const { ctx } = mockCanvas({ opaque: true });
    const result = await optimizeImageFile(big('image/png', 'print.png'));

    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('print.jpg');
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('PNG com transparência continua PNG', async () => {
    const { sizes } = mockCanvas({ opaque: false });
    const result = await optimizeImageFile(big('image/png', 'logo.png'));

    expect(result.type).toBe('image/png');
    expect(result.name).toBe('logo.png');
    expect(sizes[0].type).toBe('image/png');
  });

  it('PNG continua PNG quando o campo não aceita JPEG', async () => {
    mockCanvas({ opaque: true });
    const result = await optimizeImageFile(big('image/png', 'print.png'), { allowJpeg: false });
    expect(result.type).toBe('image/png');
  });

  it('se não ficar menor, devolve o original', async () => {
    mockCanvas({ blobBytes: 3 * 1024 * 1024 });
    const original = big('image/jpeg', 'ja-otimizada.jpg');
    expect(await optimizeImageFile(original)).toBe(original);
  });

  it('não mexe em PDF, em imagem pequena nem quando o navegador não sabe decodificar', async () => {
    const pdf = big('application/pdf', 'nota.pdf');
    expect(await optimizeImageFile(pdf)).toBe(pdf);

    const small = new File([new Uint8Array(10 * 1024)], 'mini.jpg', { type: 'image/jpeg' });
    expect(await optimizeImageFile(small)).toBe(small);

    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('HEIC?')));
    const photo = big('image/jpeg', 'foto.jpg');
    expect(await optimizeImageFile(photo)).toBe(photo);
  });

  it('prepareUploads guarda o tamanho original para mostrar quanto encolheu', async () => {
    mockCanvas();
    const [upload] = await prepareUploads([big('image/jpeg', 'IMG_9.jpg')]);
    expect(upload.originalSize).toBe(2 * 1024 * 1024);
    expect(upload.file.size).toBe(200 * 1024);
    expect(upload.name).toBe('IMG_9');
    expect(upload.description).toBe('');
  });
});
