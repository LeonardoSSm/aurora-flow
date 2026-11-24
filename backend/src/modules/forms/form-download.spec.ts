import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  detectDownloadExtension,
  downloadContentDisposition,
  downloadFieldsWithoutFile,
  FORM_DOWNLOAD_MAX_BYTES,
  FORM_DOWNLOAD_PATH_PATTERN,
  normalizeDownloadFields,
  parseDownloadFile,
  safeDownloadBaseName,
} from './form-download';
import { downloadFileExists, FORM_DOWNLOADS_DIR, FormDownloadService } from './form-download.service';

const FORM_ID = '11111111-2222-4333-8444-555555555555';
const DIR_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

/** O multer entrega o nome UTF-8 lido como Latin-1. */
const asMulterReadsIt = (name: string): string => Buffer.from(name, 'utf8').toString('latin1');

describe('detectDownloadExtension', () => {
  it('reconhece PDF, PNG e JPG pelos bytes, seja qual for o nome', () => {
    expect(detectDownloadExtension(PDF, 'termo.docx')).toBe('pdf');
    expect(detectDownloadExtension(PNG, 'foto.pdf')).toBe('png');
    expect(detectDownloadExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'x')).toBe('jpg');
  });

  it('ZIP e OLE só passam com a extensão do Office/ODF que cabe naquele contêiner', () => {
    expect(detectDownloadExtension(ZIP, 'Termo.DOCX')).toBe('docx');
    expect(detectDownloadExtension(ZIP, 'planilha.xlsx')).toBe('xlsx');
    expect(detectDownloadExtension(ZIP, 'termo.odt')).toBe('odt');
    expect(detectDownloadExtension(ZIP, 'pacote.zip')).toBeNull();
    expect(detectDownloadExtension(ZIP, 'termo.doc')).toBeNull();
    expect(detectDownloadExtension(OLE, 'termo.doc')).toBe('doc');
    expect(detectDownloadExtension(OLE, 'termo.xls')).toBe('xls');
    expect(detectDownloadExtension(OLE, 'termo.docx')).toBeNull();
  });

  it('recusa HTML, SVG e qualquer coisa fora da lista, mesmo com nome de PDF', () => {
    expect(detectDownloadExtension(HTML, 'termo.pdf')).toBeNull();
    expect(detectDownloadExtension(SVG, 'termo.png')).toBeNull();
    expect(detectDownloadExtension(Buffer.from('MZ\x90\x00'), 'termo.docx')).toBeNull();
  });
});

describe('safeDownloadBaseName', () => {
  it('mantém acentos e tira extensão e caracteres perigosos', () => {
    expect(safeDownloadBaseName('Termo de Responsabilidade (versão 2).pdf')).toBe(
      'Termo de Responsabilidade (versão 2)',
    );
    expect(safeDownloadBaseName('../../etc/passwd.pdf')).toBe('etc_passwd');
    expect(safeDownloadBaseName('a<b>c"d.docx')).toBe('a_b_c_d');
    expect(safeDownloadBaseName('.oculto.pdf')).toBe('oculto');
  });

  it('nome vazio ou só símbolos vira "arquivo"; nome longo é cortado', () => {
    expect(safeDownloadBaseName('.pdf')).toBe('arquivo');
    expect(safeDownloadBaseName('***.pdf')).toBe('arquivo');
    expect(safeDownloadBaseName(`${'x'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(74);
  });

  it('o caminho montado com o nome limpo sempre bate com o padrão', () => {
    for (const name of ['Termo.pdf', 'ç ã é (1).docx', '../x.pdf', '.pdf', `${'y'.repeat(300)}.pdf`]) {
      const path = `${FORM_ID}/${DIR_ID}/${safeDownloadBaseName(name)}.pdf`;
      expect(FORM_DOWNLOAD_PATH_PATTERN.test(path)).toBe(true);
    }
  });
});

describe('parseDownloadFile / normalizeDownloadFields', () => {
  const path = `${FORM_ID}/${DIR_ID}/Termo.pdf`;

  it('aceita o caminho gerado pelo servidor e guarda só path, name e size', () => {
    expect(parseDownloadFile({ path, name: 'Termo.pdf', size: 1234, url: 'https://evil' })).toEqual({
      path,
      name: 'Termo.pdf',
      size: 1234,
    });
    expect(parseDownloadFile(undefined)).toBeNull();
  });

  it('recusa URL externa, caminho com .. e extensão fora da lista', () => {
    expect(() => parseDownloadFile({ path: 'https://evil.com/x.pdf' })).toThrow();
    expect(() => parseDownloadFile({ path: `${FORM_ID}/../../x.pdf` })).toThrow();
    expect(() => parseDownloadFile({ path: `${FORM_ID}/${DIR_ID}/x.html` })).toThrow();
    expect(() => parseDownloadFile('texto')).toThrow();
  });

  it('no salvar, o campo fica só com downloadFile (ou vazio, sem arquivo) e os outros tipos não mudam', () => {
    const sections = [
      {
        fields: [
          { fieldType: 'file_download', settingsJson: { downloadFile: { path, name: 'Termo.pdf', size: 9 }, extra: 1 } },
          { fieldType: 'file_download', settingsJson: { qualquer: true } },
          { fieldType: 'short_text', settingsJson: { maxLength: 10 } },
        ],
      },
    ];
    normalizeDownloadFields(sections);
    expect(sections[0].fields[0].settingsJson).toEqual({
      downloadFile: { path, name: 'Termo.pdf', size: 9 },
    });
    expect(sections[0].fields[1].settingsJson).toEqual({});
    expect(sections[0].fields[2].settingsJson).toEqual({ maxLength: 10 });
    expect(downloadFieldsWithoutFile(sections[0].fields)).toEqual([sections[0].fields[1]]);
  });
});

describe('FormDownloadService', () => {
  const service = new FormDownloadService();
  const created: string[] = [];

  afterAll(async () => {
    for (const path of created) {
      await fs.rm(join(process.cwd(), FORM_DOWNLOADS_DIR, ...path.split('/').slice(0, 2)), {
        recursive: true,
        force: true,
      });
    }
  });

  it('grava com nome limpo e extensão do conteúdo, e o arquivo existe para a publicação', async () => {
    const saved = await service.save(FORM_ID, {
      originalname: asMulterReadsIt('Termo de Autorização.PDF'),
      size: PDF.length,
      buffer: PDF,
    });
    created.push(saved.path);
    expect(saved.name).toBe('Termo de Autorização.pdf');
    expect(saved.size).toBe(PDF.length);
    expect(saved.path).toMatch(new RegExp(`^${FORM_ID}/[0-9a-f-]{36}/Termo de Autorização\\.pdf$`));
    expect(await downloadFileExists(saved.path)).toBe(true);
    expect(await downloadFileExists(`${FORM_ID}/${DIR_ID}/nao-existe.pdf`)).toBe(false);
  });

  it('recusa tipo não aceito, arquivo vazio e arquivo grande', async () => {
    await expect(
      service.save(FORM_ID, { originalname: 'termo.pdf', size: HTML.length, buffer: HTML }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save(FORM_ID, { originalname: 'termo.pdf', size: 0, buffer: Buffer.alloc(0) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save(FORM_ID, { originalname: 'termo.pdf', size: FORM_DOWNLOAD_MAX_BYTES + 1, buffer: PDF }),
    ).rejects.toThrow('10 MB');
  });
});

describe('downloadContentDisposition', () => {
  it('manda o nome em UTF-8 (filename*) e uma reserva ASCII sem acento nem aspas', () => {
    expect(downloadContentDisposition('Termo de Responsabilidade (versão 2).pdf')).toBe(
      `attachment; filename="Termo de Responsabilidade (versao 2).pdf"; filename*=UTF-8''Termo%20de%20Responsabilidade%20%28vers%C3%A3o%202%29.pdf`,
    );
    expect(downloadContentDisposition('Termo.pdf')).toBe(
      `attachment; filename="Termo.pdf"; filename*=UTF-8''Termo.pdf`,
    );
  });
});
