import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { mockCameraEnvironment } from '../../../test/camera-env';
import { createPendingUpload, type PendingUpload } from '../../../lib/attachment-upload';
import { PublicQuestionField } from './public-question-field';
import type { PublicFormField } from '../types';

const calculatedField: PublicFormField = {
  id: 'f-total',
  code: 'total',
  label: 'Total do pedido',
  fieldType: 'calculated',
  required: false,
  order: 1,
  settingsJson: { formula: '{quantidade} * {preco}', formulaDecimals: 2, formulaPrefix: 'R$ ' },
  conditionsJson: {},
  visibilityRules: null,
  options: [],
};

describe('PublicQuestionField — lista suspensa', () => {
  const selectField: PublicFormField = {
    id: 'f-uf',
    code: 'uf',
    label: 'Estado',
    fieldType: 'single_select',
    required: true,
    order: 1,
    settingsJson: { displayAs: 'dropdown' },
    conditionsJson: {},
    visibilityRules: null,
    options: [
      { id: 'o1', internalValue: 'sp', displayLabel: 'São Paulo' },
      { id: 'o2', internalValue: 'rj', displayLabel: 'Rio de Janeiro' },
    ],
  };

  it('mostra a lista fechada no lugar dos botões e grava o valor da opção', () => {
    const onChange = vi.fn();
    render(
      <PublicQuestionField field={selectField} value={null} onChange={onChange} onToggleMulti={() => {}} />,
    );
    expect(screen.queryByText('São Paulo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('São Paulo'));
    expect(onChange).toHaveBeenCalledWith('sp');
  });

  it('várias: grava a lista inteira de valores', () => {
    const onChange = vi.fn();
    render(
      <PublicQuestionField
        field={{ ...selectField, fieldType: 'multi_select' }}
        value={['rj']}
        onChange={onChange}
        onToggleMulti={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('São Paulo'));
    expect(onChange).toHaveBeenCalledWith(['rj', 'sp']);
  });

  it('sem displayAs continua com os botões', () => {
    render(
      <PublicQuestionField
        field={{ ...selectField, settingsJson: {} }}
        value={null}
        onChange={() => {}}
        onToggleMulti={() => {}}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'São Paulo' })).toBeInTheDocument();
  });
});

describe('PublicQuestionField — campo calculado', () => {
  it('mostra o resultado formatado, sem campo editável', () => {
    const { container } = render(
      <PublicQuestionField
        field={calculatedField}
        value={1234.5}
        onChange={() => {}}
        onToggleMulti={() => {}}
      />,
    );

    expect(screen.getByText('Total do pedido')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.234,50')).toBeInTheDocument();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('avisa que o cálculo aguarda os campos de origem', () => {
    render(
      <PublicQuestionField
        field={calculatedField}
        value={null}
        onChange={() => {}}
        onToggleMulti={() => {}}
      />,
    );

    expect(screen.getByText('Aguardando os campos do cálculo')).toBeInTheDocument();
  });
});

describe('PublicQuestionField — campos compactos', () => {
  const textField = (fieldType: PublicFormField['fieldType']): PublicFormField => ({
    ...calculatedField,
    id: `f-${fieldType}`,
    code: fieldType,
    label: 'Observação',
    fieldType,
    settingsJson: {},
  });

  it('caixa de texto de uma linha tem 36 px; a de várias linhas não fica presa nessa altura', () => {
    const { container, rerender } = render(
      <PublicQuestionField field={textField('short_text')} value="" onChange={() => {}} onToggleMulti={() => {}} />,
    );
    expect(container.querySelector('input')).toHaveStyle({ height: '36px', fontSize: '13px' });

    rerender(
      <PublicQuestionField field={textField('long_text')} value="" onChange={() => {}} onToggleMulti={() => {}} />,
    );
    expect(container.querySelector('textarea')).toHaveStyle({ height: 'auto' });
  });
});

const productTableField: PublicFormField = {
  id: 'f-tabela',
  code: 'tabela',
  label: 'Dados da Instituição',
  fieldType: 'product_table',
  required: false,
  order: 1,
  settingsJson: {
    productTableColumns: [
      { id: 'col-qtd', label: 'Quantidade', type: 'number', filledBy: 'respondent' },
      { id: 'col-desc', label: 'Descrição', type: 'text', filledBy: 'respondent' },
    ],
  },
  conditionsJson: {},
  visibilityRules: null,
  options: [
    { id: '1', internalValue: 'instituicao', displayLabel: 'Nome da Instituição de Ensino', order: 1 },
    { id: '2', internalValue: 'curso', displayLabel: 'Nome do Curso', order: 2 },
  ],
};

describe('PublicQuestionField — tabela de produtos, largura das colunas', () => {
  // Motivo do teste: a coluna "Produto" não tinha largura definida, então herdava 100% do
  // espaço que sobrava da tabela (table-layout auto) — um nome curto deixava um vão enorme
  // antes da coluna de valor, que ficava espremida numa faixa fixa e pequena no canto.
  // Agora a largura é proporcional (colgroup + table-layout: fixed): produto ganha mais
  // espaço que uma coluna só, mas de forma limitada, não "o que sobrar".
  it('reparte a largura da tabela proporcionalmente, sem a coluna de produto tomar 100% do espaço livre', () => {
    const { container } = render(
      <PublicQuestionField
        field={productTableField}
        value={[]}
        onChange={() => {}}
        onToggleMulti={() => {}}
      />,
    );

    const cols = container.querySelectorAll('table colgroup col');
    expect(cols).toHaveLength(3); // produto + Quantidade (número) + Descrição (texto)

    const widths = Array.from(cols).map((col) => parseFloat((col as HTMLElement).style.width));
    const [produtoWidth, quantidadeWidth, descricaoWidth] = widths;

    // Pesos: produto 1.5, número 0.6, texto 1 — total 3.1.
    expect(produtoWidth).toBeCloseTo((1.5 / 3.1) * 100, 1);
    expect(quantidadeWidth).toBeCloseTo((0.6 / 3.1) * 100, 1);
    expect(descricaoWidth).toBeCloseTo((1 / 3.1) * 100, 1);

    // As três larguras somam 100% da tabela — nenhuma coluna some nem sobra espaço órfão.
    expect(produtoWidth + quantidadeWidth + descricaoWidth).toBeCloseTo(100, 1);

    // A coluna de produto tem teto: mesmo sendo a de maior peso, não passa da metade da
    // tabela (o bug original dava a ela 100% do espaço restante).
    expect(produtoWidth).toBeLessThan(50);
  });

  // Motivo do teste: com o formulário em 420 px (ficha do ERP aberta ao lado), as fatias
  // proporcionais ficavam menores que o texto e os cabeçalhos "QUANTIDADE"/"LOTE" encavalavam.
  it('tem largura mínima em que cada coluna cabe; abaixo disso rola em vez de espremer', () => {
    const { container } = render(
      <PublicQuestionField
        field={productTableField}
        value={[]}
        onChange={() => {}}
        onToggleMulti={() => {}}
      />,
    );

    const table = container.querySelector('table') as HTMLTableElement;
    const minWidth = parseFloat(table.style.minWidth);
    // Quantidade (número, piso 84 + 16 de respiro) fica com 0.6/3.1 da tabela: é ela que manda.
    expect(minWidth).toBe(Math.ceil(100 / (0.6 / 3.1)));
    expect(table.parentElement).toHaveClass('overflow-x-auto');
  });
});

const fileUploadField: PublicFormField = {
  id: 'f-foto',
  code: 'foto',
  label: 'Foto da etiqueta',
  fieldType: 'file_upload',
  required: false,
  order: 1,
  // maxFiles/maxSizeInBytes ficaram de campos antigos: não limitam mais nada.
  settingsJson: { maxFiles: 1, maxSizeInBytes: 1024 * 1024 },
  conditionsJson: {},
  visibilityRules: null,
  options: [],
};

function pending(file: File, overrides: Partial<PendingUpload> = {}): PendingUpload {
  return { ...createPendingUpload(file), ...overrides };
}

function renderFileField(
  overrides: Partial<PublicFormField['settingsJson']> = {},
  props: {
    pendingFiles?: PendingUpload[];
    onAddFiles?: (uploads: PendingUpload[]) => void;
    onUpdateFile?: (id: string, patch: Partial<Pick<PendingUpload, 'name' | 'description'>>) => void;
    error?: string;
  } = {},
) {
  return render(
    <PublicQuestionField
      field={{ ...fileUploadField, settingsJson: { ...fileUploadField.settingsJson, ...overrides } }}
      value={null}
      error={props.error}
      pendingFiles={props.pendingFiles ?? []}
      onChange={() => {}}
      onToggleMulti={() => {}}
      onAddFiles={props.onAddFiles ?? (() => {})}
      onUpdateFile={props.onUpdateFile}
    />,
  );
}

describe('PublicQuestionField — campo de arquivo com câmera', () => {
  let restore: () => void = () => undefined;

  beforeEach(() => {
    restore = mockCameraEnvironment({ touch: true });
  });

  afterEach(() => {
    restore();
  });

  it('oferece "Tirar foto" além do seletor de arquivos e envia a foto tirada como arquivo pendente', async () => {
    const onAddFiles = vi.fn();
    const { container } = renderFileField({}, { onAddFiles });

    expect(screen.getByText('Arraste arquivos ou clique para selecionar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeInTheDocument();

    const photo = new File(['x'], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const cameraInput = container.querySelector('input[capture]') as HTMLInputElement;
    fireEvent.change(cameraInput, { target: { files: [photo] } });

    await waitFor(() => expect(onAddFiles).toHaveBeenCalledTimes(1));
    const [uploads] = onAddFiles.mock.calls[0] as [PendingUpload[]];
    expect(uploads).toHaveLength(1);
    expect(uploads[0].file).toBe(photo);
    expect(uploads[0].name).toBe('IMG_0001');
  });

  it('também oferece a câmera quando o campo aceita imagens específicas, como image/jpeg', () => {
    renderFileField({ allowedMimeTypes: ['image/jpeg', 'application/pdf'] });

    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeInTheDocument();
  });

  it('não oferece a câmera quando o campo aceita só PDF (a câmera gera JPEG)', () => {
    renderFileField({ allowedMimeTypes: ['application/pdf'] });

    expect(screen.queryByRole('button', { name: 'Tirar foto' })).not.toBeInTheDocument();
  });

  it('sem limite de tamanho: aceita foto maior que o antigo maxSizeInBytes do campo', async () => {
    const onAddFiles = vi.fn();
    const { container } = renderFileField({ maxSizeInBytes: 1024 * 1024 }, { onAddFiles });

    const bigPhoto = new File([new Uint8Array(2 * 1024 * 1024)], 'grande.jpg', { type: 'image/jpeg' });
    fireEvent.change(container.querySelector('input[capture]') as HTMLInputElement, {
      target: { files: [bigPhoto] },
    });

    await waitFor(() => expect(onAddFiles).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sem limite de quantidade: soma uma nova foto mesmo com o antigo maxFiles = 1 já ocupado', async () => {
    const onAddFiles = vi.fn();
    const existing = pending(new File(['a'], 'primeira.jpg', { type: 'image/jpeg' }));
    const { container } = renderFileField({ maxFiles: 1 }, { pendingFiles: [existing], onAddFiles });

    const second = new File(['b'], 'segunda.jpg', { type: 'image/jpeg' });
    fireEvent.change(container.querySelector('input[capture]') as HTMLInputElement, {
      target: { files: [second] },
    });

    await waitFor(() => expect(onAddFiles).toHaveBeenCalledTimes(1));
    expect((onAddFiles.mock.calls[0] as [PendingUpload[]])[0][0].file).toBe(second);
    expect((container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement).multiple).toBe(true);
  });

  it('arrastar um tipo que o campo não aceita avisa e não adiciona', async () => {
    const onAddFiles = vi.fn();
    renderFileField({ allowedMimeTypes: ['application/pdf'] }, { onAddFiles });

    const zone = screen.getByText('Arraste arquivos ou clique para selecionar').closest('[role="button"]') as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'planilha.csv', { type: 'text/csv' })] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Tipo de arquivo não aceito');
    expect(onAddFiles).not.toHaveBeenCalled();
  });

  it('sem câmera no dispositivo, mantém só o seletor de arquivos', () => {
    restore();
    restore = mockCameraEnvironment({ touch: false });

    renderFileField();

    expect(screen.queryByRole('button', { name: 'Tirar foto' })).not.toBeInTheDocument();
    expect(screen.getByText('Arraste arquivos ou clique para selecionar')).toBeInTheDocument();
  });
});

describe('PublicQuestionField — nome e descrição de cada arquivo', () => {
  it('mostra nome (com a extensão fixa ao lado) e descrição de cada arquivo, e repassa o que a pessoa digita', () => {
    const onUpdateFile = vi.fn();
    const upload = pending(new File(['a'], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    renderFileField({}, { pendingFiles: [upload], onUpdateFile });

    const name = screen.getByLabelText('Nome do arquivo') as HTMLInputElement;
    expect(name.value).toBe('IMG_0001');
    expect(screen.getByText('.jpg')).toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'Etiqueta lote 12' } });
    expect(onUpdateFile).toHaveBeenCalledWith(upload.id, { name: 'Etiqueta lote 12' });

    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Frente da caixa' } });
    expect(onUpdateFile).toHaveBeenCalledWith(upload.id, { description: 'Frente da caixa' });
  });

  it('com erro no campo, aponta o arquivo que ainda não foi renomeado nem descrito', () => {
    const ok = pending(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), { description: 'Nota fiscal' });
    const missing = pending(new File(['b'], 'b.jpg', { type: 'image/jpeg' }));
    renderFileField({}, { pendingFiles: [ok, missing], error: 'Dê um nome novo ou uma descrição a cada arquivo.' });

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Renomeie o arquivo ou escreva uma descrição.');
  });

  it('campo com a exigência desligada não aponta nada', () => {
    const missing = pending(new File(['b'], 'b.jpg', { type: 'image/jpeg' }));
    renderFileField({ requireFileLabel: false }, { pendingFiles: [missing], error: 'qualquer' });

    expect(screen.queryByText('Renomeie o arquivo ou escreva uma descrição.')).not.toBeInTheDocument();
    expect(screen.getByText('Pode enviar vários arquivos.')).toBeInTheDocument();
  });

  it('mostra quanto a foto encolheu quando foi otimizada', () => {
    const optimized = pending(new File([new Uint8Array(400 * 1024)], 'foto.jpg', { type: 'image/jpeg' }), {
      originalSize: 6 * 1024 * 1024,
    });
    renderFileField({}, { pendingFiles: [optimized] });

    expect(screen.getByText(/400,0 KB \(otimizada de 6,0 MB\)/)).toBeInTheDocument();
  });
});

describe('PublicQuestionField — arquivo para baixar', () => {
  const path = '11111111-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/Termo de Autorização.pdf';
  const downloadField: PublicFormField = {
    id: 'f-termo',
    code: 'termo',
    label: 'Baixe o termo, assine e anexe abaixo',
    fieldType: 'file_download',
    required: false,
    order: 1,
    settingsJson: { downloadFile: { path, name: 'Termo de Autorização.pdf', size: 150 * 1024 } },
    conditionsJson: {},
    visibilityRules: null,
    options: [],
  };

  it('mostra o texto, o nome com tamanho e um link que baixa o arquivo do servidor', () => {
    render(<PublicQuestionField field={downloadField} value={null} onChange={() => {}} onToggleMulti={() => {}} />);
    expect(screen.getByText('Baixe o termo, assine e anexe abaixo')).toBeInTheDocument();
    expect(screen.getByText('Termo de Autorização.pdf · 150 KB')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /baixar arquivo/i });
    expect(link.getAttribute('href')).toMatch(
      /\/public\/form-downloads\/11111111-2222-4333-8444-555555555555\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/Termo%20de%20Autoriza%C3%A7%C3%A3o\.pdf$/,
    );
    expect(link).toHaveAttribute('download', 'Termo de Autorização.pdf');
    // Não é pergunta: nada de asterisco nem campo para preencher.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('na prévia de um rascunho sem arquivo, avisa em vez de mostrar um botão quebrado', () => {
    render(
      <PublicQuestionField
        field={{ ...downloadField, settingsJson: {} }}
        value={null}
        onChange={() => {}}
        onToggleMulti={() => {}}
      />,
    );
    expect(screen.getByText('Arquivo ainda não enviado.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
