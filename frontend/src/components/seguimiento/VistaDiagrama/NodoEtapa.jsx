import { memo } from 'react';
import NodoBase, { nodosIguales } from './NodoBase';

function NodoEtapa(props) {
  return <NodoBase {...props} tipo="etapa" />;
}

export default memo(NodoEtapa, nodosIguales);
