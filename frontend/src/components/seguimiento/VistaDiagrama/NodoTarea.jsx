import { memo } from 'react';
import NodoBase, { nodosIguales } from './NodoBase';

function NodoTarea(props) {
  return <NodoBase {...props} tipo="tarea" />;
}

export default memo(NodoTarea, nodosIguales);
