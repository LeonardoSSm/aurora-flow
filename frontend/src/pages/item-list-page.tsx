import { useParams } from 'react-router-dom';
import { ItemListEditorView } from '../modules/item-lists/views/item-list-editor-view';

/** `/listas-de-itens/nova` cria; `/listas-de-itens/:listId` edita. */
export function ItemListPage({ isNew = false }: { isNew?: boolean }) {
  const { listId } = useParams();
  const id = isNew ? null : (listId ?? null);
  // key: trocar de lista (ou criar e ir para a nova) remonta o editor com o rascunho certo.
  return <ItemListEditorView key={id ?? 'nova'} listId={id} />;
}
