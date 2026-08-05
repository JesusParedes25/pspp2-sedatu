import { memo } from 'react';
import NodoBase, { nodosIguales } from './NodoBase';

function NodoAccion(props) {
  return <NodoBase {...props} tipo="accion" />;
}

export default memo(NodoAccion, nodosIguales);
