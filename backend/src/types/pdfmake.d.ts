/**
 * Tipos do gerador de PDF do lado do servidor.
 *
 * O pacote `@types/pdfmake` descreve a API de **navegador** (`createPdf` global),
 * nao a instancia que a versao 0.3 exporta para Node. Antes havia aqui um
 * `declare module 'pdfmake'` seco, que tornava o modulo inteiro `any` — e foi
 * exatamente isso que deixou passar uma exportacao de PDF que nunca funcionou:
 * o codigo fazia `new PdfPrinter(...)` sobre o que na verdade e uma instancia
 * pronta, e o compilador nao tinha como reclamar.
 *
 * A declaracao abaixo descreve o que o pacote realmente entrega.
 */
declare module 'pdfmake' {
  import type { Readable } from 'stream';

  /** Caminhos dos arquivos de fonte, por familia. */
  interface FontDescriptor {
    normal?: string;
    bold?: string;
    italics?: string;
    bolditalics?: string;
  }

  interface OutputDocument {
    /** Resolve com o PDF inteiro em memoria. */
    getBuffer(): Promise<Buffer>;
    getStream(): Promise<Readable>;
  }

  interface PdfMake {
    /** Registra fontes sem descartar as ja registradas. */
    addFonts(fonts: Record<string, FontDescriptor>): void;
    setFonts(fonts: Record<string, FontDescriptor>): void;
    /**
     * Autoriza a leitura de arquivos locais. Por padrao a 0.3 nega tudo, o que
     * impede ate as fontes que acompanham o proprio pacote de serem carregadas.
     */
    setLocalAccessPolicy(callback: (caminho: string) => boolean): void;
    /** Autoriza buscar recursos por URL (imagens remotas). Sem politica, a 0.3 avisa e busca. */
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    createPdf(
      docDefinition: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): OutputDocument;
  }

  const pdfmake: PdfMake;
  export = pdfmake;
}
