/**
 * ARCHIVO: Agenda.jsx
 * PROPÓSITO: Página de agenda con acciones pendientes del usuario, con
 *            vista de calendario (predeterminada — Mes/Semana/Día) y vista
 *            de lista (agrupada por urgencia).
 *
 * MINI-CLASE: Agenda como vista personal de pendientes
 * ─────────────────────────────────────────────────────────────────
 * La agenda muestra las acciones asignadas al usuario autenticado. Tiene
 * dos "modelos de contenido" intercambiables (Lista/Calendario, botón
 * arriba a la derecha):
 * (1) Calendario — vista por fecha exacta, con tres niveles de zoom
 *     (Mes/Semana/Día, sub-pestañas dentro de la propia vista): Mes
 *     muestra puntos de color por día; Semana, una vista previa
 *     compacta por columna; Día, el detalle completo del día
 *     seleccionado. Los tres comparten una sola fecha "ancla" — cambiar
 *     de zoom nunca pierde en qué parte del calendario estabas.
 * (2) Lista — acciones agrupadas por urgencia (Vencidas/Hoy/Esta
 *     semana/Este mes/Próximas/Finalizadas).
 * Ambas comparten el mismo componente para dibujar cada actividad
 * (ArbolActividadesProyecto: agrupado por proyecto, árbol real Etapa ›
 * Acción › Tarea, tarjetas accionables de verdad) — no hay una tercera
 * presentación de "lista de actividades" distinta en este archivo.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CalendarDays, List, ChevronLeft, ChevronRight, X, AlertCircle, Clock, CheckCircle2, Search, ChevronDown } from 'lucide-react';
import * as accionesApi from '../api/acciones';
import EmptyState from '../components/common/EmptyState';
import ArbolActividadesProyecto from '../components/nodos/ArbolActividadesProyecto';
import { COLORES_SEMAFORO, LEYENDA_SEMAFORO } from '../components/common/SemaforoDot';

const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const HOY=new Date().toISOString().slice(0,10);

// Color real (hex) de cada punto del calendario — mismo criterio que el
// resto de la plataforma (COLORES_SEMAFORO), más el matiz propio de
// Agenda para "vence hoy" (naranja), que no existe en el semáforo general.
// Antes esto vivía como clases de Tailwind (bg-red-500, etc.) que no eran
// el mismo color que la leyenda describía — dos fuentes de verdad que se
// fueron separando con el tiempo.
const COLOR_PUNTO={...COLORES_SEMAFORO, naranja:'#f97316'};

function norm(s){if(!s)return null;return String(s).slice(0,10);}
function pFecha(s){if(!s)return null;const str=norm(s);const[y,m,d]=str.split('-').map(Number);if(!y||!m||!d)return null;return new Date(y,m-1,d);}
function diff(s){if(!s)return null;const h=new Date();h.setHours(0,0,0,0);const t=pFecha(s);if(!t)return null;return Math.ceil((t-h)/86400000);}
// Mismo semáforo que ya usa el resto de la plataforma (semaforo_efectivo,
// calculado en el backend por avance-semaforo.js — respeta estado,
// prioridad y un semáforo fijado a mano) — antes la Agenda decidía su
// propio color solo por días-hasta-vencer, sin mirar nada de eso. "Vence
// hoy" (naranja) es el único matiz que sigue siendo propio de la vista de
// calendario, para que el día de hoy salte a la vista.
function ukey(it){
  if(it.estado==='Completada'||it.estado==='Cancelada')return'gris';
  if(diff(it.fecha_fin)===0)return'naranja';
  return it.semaforo_efectivo||'gris';
}
// true si el día "str" (YYYY-MM-DD) es el día de inicio O el de fin de la
// actividad — solo esos dos días muestran punto en el calendario (no todos
// los días intermedios, para no saturar el mes con actividades largas).
function esInicioOFin(it,str){
  if(!str||!it.fecha_fin)return false;
  const ini=it.fecha_inicio||it.fecha_fin;
  return str===ini||str===it.fecha_fin;
}
function strDeFecha(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function addDias(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function addMeses(d,n){return new Date(d.getFullYear(),d.getMonth()+n,1);}
// Lunes como inicio de semana, mismo criterio que ya usa la grilla de mes
// (DIAS empieza en "Lun").
function inicioSemana(d){
  const r=new Date(d);
  const dow=r.getDay();
  r.setDate(r.getDate()+(dow===0?-6:1-dow));
  return r;
}

export default function Agenda(){
  const[items,setItems]=useState([]);
  const[load,setLoad]=useState(true);
  const[vista,setVista]=useState('calendario');
  const[modoCal,setModoCal]=useState('mes'); // 'mes'|'semana'|'dia'
  // Una sola fecha "ancla" para los tres niveles de zoom del calendario —
  // así cambiar de Mes a Semana a Día nunca "olvida" dónde estabas.
  const[ancla,setAncla]=useState(()=>new Date());
  const[dia,setDia]=useState(null);
  const[ftipo,setFtipo]=useState('todos');
  const[festado,setFestado]=useState('todos');
  // Filtro rápido de urgencia — lo que antes eran las tarjetas KPI de solo
  // lectura arriba, ahora también funcionan como este filtro.
  const[furg,setFurg]=useState('todos'); // 'todos'|'venc'|'hoy'|'sem'
  const[fproy,setFproy]=useState('todos');
  const[frol,setFrol]=useState('todos');
  const[q,setQ]=useState('');

  // cargar() se expone (no solo un efecto de una sola vez) para poder
  // refrescar la lista después de registrar avance/riesgo desde cualquier
  // vista — mismo patrón que MisActividades.jsx.
  const cargar=useCallback(()=>{
    accionesApi.obtenerAgenda().then(r=>setItems((r.datos||[]).map(i=>({...i,fecha_fin:norm(i.fecha_fin),fecha_inicio:norm(i.fecha_inicio)})))).catch(console.error).finally(()=>setLoad(false));
  },[]);
  useEffect(()=>{ cargar(); },[cargar]);

  const proyectos=useMemo(()=>{
    const m=new Map();
    items.forEach(i=>{ if(i.proyecto_id&&!m.has(i.proyecto_id))m.set(i.proyecto_id,i.proyecto_nombre); });
    return[...m.entries()].sort((a,b)=>(a[1]||'').localeCompare(b[1]||''));
  },[items]);

  // Filtros de búsqueda/tipo/estado/proyecto/rol, SIN el filtro rápido de
  // urgencia (furg) — es la base sobre la que se calculan los números de
  // las propias tarjetas KPI. Si los KPIs se calcularan ya con furg
  // aplicado, al hacer clic en "Vencidas" las 4 tarjetas colapsarían al
  // mismo número (Total dejaría de mostrar el total real) y, si esa
  // categoría llegaba a 0, la fila entera de KPIs desaparecía sin dejar
  // forma de volver a "Total".
  const filtradosSinUrgencia=useMemo(()=>items.filter(it=>{
    if(ftipo!=='todos'&&it.tipo!==ftipo)return false;
    if(festado!=='todos'&&it.estado!==festado)return false;
    if(fproy!=='todos'&&String(it.proyecto_id)!==fproy)return false;
    if(frol!=='todos'&&it.mi_rol!==frol)return false;
    if(q){const sq=q.toLowerCase();if(!((it.nombre||'').toLowerCase().includes(sq)||(it.proyecto_nombre||'').toLowerCase().includes(sq)))return false;}
    return true;
  }),[items,ftipo,festado,fproy,frol,q]);

  // `filtrados` sí incluye furg — es lo que alimenta Lista/Calendario,
  // donde hacer clic en un KPI debe acotar lo que se ve abajo.
  const filtrados=useMemo(()=>filtradosSinUrgencia.filter(it=>{
    if(furg==='venc'){const d=diff(it.fecha_fin);if(!(d!==null&&d<0)||it.estado==='Completada'||it.estado==='Cancelada')return false;}
    if(furg==='hoy'&&it.fecha_fin!==HOY)return false;
    if(furg==='sem'){const d=diff(it.fecha_fin);if(!(d!==null&&d>0&&d<=7)||it.estado==='Completada'||it.estado==='Cancelada')return false;}
    return true;
  }),[filtradosSinUrgencia,furg]);

  // KPIs calculados sobre `filtradosSinUrgencia` (búsqueda/tipo/estado/
  // proyecto/rol), no sobre `items` crudo ni sobre `filtrados` — antes
  // mostraban el total sin filtrar y nunca cambiaban al buscar/filtrar
  // (números que no coincidían con lo que se veía abajo); calcularlos
  // sobre `filtrados` en cambio los haría colapsar entre sí al activarse
  // ellos mismos, ver comentario arriba. `stats.hoy` mantiene la misma
  // asimetría de siempre (no excluye Completada/Cancelada, a diferencia
  // de venc/sem) — comportamiento preexistente, no parte de este fix.
  const stats=useMemo(()=>{
    const act=filtradosSinUrgencia.filter(i=>i.estado!=='Completada'&&i.estado!=='Cancelada');
    return{total:filtradosSinUrgencia.length,venc:act.filter(i=>(diff(i.fecha_fin)??0)<0).length,hoy:filtradosSinUrgencia.filter(i=>i.fecha_fin===HOY).length,sem:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>0&&d<=7;}).length};
  },[filtradosSinUrgencia]);

  const grupos=useMemo(()=>{
    const act=filtrados.filter(i=>i.estado!=='Completada'&&i.estado!=='Cancelada');
    const fin=filtrados.filter(i=>i.estado==='Completada'||i.estado==='Cancelada');
    const asc=(a,b)=>{const fa=a.fecha_fin||'',fb=b.fecha_fin||'';return fa<fb?-1:fa>fb?1:0;};
    const desc=(a,b)=>-asc(a,b);
    return[
      {id:'venc',tit:'Vencidas',    I:AlertCircle, ic:'text-red-500',   items:act.filter(i=>(diff(i.fecha_fin)??0)<0).sort(asc)},
      {id:'hoy', tit:'Hoy',         I:Clock,       ic:'text-orange-500',items:act.filter(i=>i.fecha_fin===HOY)},
      {id:'sem', tit:'Esta semana', I:CalendarDays,ic:'text-amber-500', items:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>0&&d<=7;}).sort(asc)},
      {id:'mes', tit:'Este mes',    I:CalendarDays,ic:'text-blue-500',  items:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>7&&d<=30;}).sort(asc)},
      {id:'prox',tit:'Próximas',    I:CalendarDays,ic:'text-green-500', items:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>30;}).sort(asc)},
      {id:'fin', tit:'Finalizadas', I:CheckCircle2,ic:'text-gray-400',  items:fin.sort(desc)},
    ].filter(g=>g.items.length>0);
  },[filtrados]);

  const diasCal=useMemo(()=>{
    const a=ancla.getFullYear(),m=ancla.getMonth();
    const ini=new Date(a,m,1);const fin=new Date(a,m+1,0);
    let off=ini.getDay()-1;if(off<0)off=6;
    const ds=[];
    for(let i=off-1;i>=0;i--)ds.push({fecha:new Date(a,m,-i),esMes:false,str:null,items:[]});
    for(let d=1;d<=fin.getDate();d++){const str=`${a}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;ds.push({fecha:new Date(a,m,d),esMes:true,str,items:filtrados.filter(i=>esInicioOFin(i,str))});}
    let ex=1;while(ds.length%7!==0)ds.push({fecha:new Date(a,m+1,ex++),esMes:false,str:null,items:[]});
    return ds;
  },[ancla,filtrados]);

  const diasSemana=useMemo(()=>{
    const inicio=inicioSemana(ancla);
    const ds=[];
    for(let i=0;i<7;i++){
      const fecha=addDias(inicio,i);
      const str=strDeFecha(fecha);
      ds.push({fecha,str,items:filtrados.filter(i=>esInicioOFin(i,str))});
    }
    return ds;
  },[ancla,filtrados]);

  const itemsDia=useMemo(()=>dia?filtrados.filter(i=>esInicioOFin(i,dia)):[],[dia,filtrados]);
  const itemsAncla=useMemo(()=>filtrados.filter(i=>esInicioOFin(i,strDeFecha(ancla))),[ancla,filtrados]);

  const hasFiltros=ftipo!=='todos'||festado!=='todos'||fproy!=='todos'||frol!=='todos'||furg!=='todos'||!!q;
  function limpiarFiltros(){setFtipo('todos');setFestado('todos');setFproy('todos');setFrol('todos');setFurg('todos');setQ('');}

  if(load)return(<div className="space-y-4 animate-pulse"><div className="h-8 bg-gray-200 rounded w-1/3"/>{[1,2,3].map(i=><div key={i} className="h-14 bg-gray-200 rounded"/>)}</div>);
  return(<div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">Agenda</h1><p className="text-sm text-gray-500 mt-0.5">Actividades con fecha — responsable, colaborador o coordinador de proyecto</p></div><div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">{[{id:'lista',lbl:'Lista',I:List},{id:'calendario',lbl:'Calendario',I:CalendarDays}].map(({id,lbl,I})=>(<button key={id} onClick={()=>{setVista(id);setDia(null);}} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${vista===id?'bg-white text-guinda-600 shadow-sm':'text-gray-500 hover:text-gray-700'}`}><I size={13}/>{lbl}</button>))}</div></div>

    {/* KPIs — filtros rápidos reales: clic para acotar a vencidas/hoy/
        esta semana, otro clic (o "Total") para quitar. Antes eran <div>
        decorativos: no respondían a los filtros de abajo (mostraban el
        total sin filtrar) ni hacían nada al hacer clic, aunque su estilo
        (fondo de color cuando hay algo) invitaba a pensar que sí. */}
    {filtradosSinUrgencia.length>0&&(<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        {id:'todos',lbl:'Total',val:stats.total,cls:'text-gray-800',bg:'bg-white border-gray-200'},
        {id:'venc',lbl:'Vencidas',val:stats.venc,cls:stats.venc>0?'text-red-600 font-bold':'text-gray-800',bg:stats.venc>0?'bg-red-50 border-red-200':'bg-white border-gray-200'},
        {id:'hoy',lbl:'Hoy',val:stats.hoy,cls:stats.hoy>0?'text-orange-600 font-bold':'text-gray-800',bg:stats.hoy>0?'bg-orange-50 border-orange-200':'bg-white border-gray-200'},
        {id:'sem',lbl:'Esta semana',val:stats.sem,cls:'text-gray-800',bg:'bg-white border-gray-200'},
      ].map(s=>(
        <button key={s.id} onClick={()=>setFurg(v=>v===s.id?'todos':s.id)} className={`card p-3.5 border text-left transition-colors ${s.bg} ${furg===s.id?'ring-2 ring-guinda-400 ring-offset-1':'hover:bg-gray-50'}`}>
          <div className={`text-2xl font-bold ${s.cls}`}>{s.val}</div>
          <div className="text-xs text-gray-500 mt-0.5">{s.lbl}</div>
        </button>
      ))}
    </div>)}

    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative min-w-44 max-w-56 flex-1"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/><input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar actividades..." className="w-full pl-7 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-guinda-300"/>{q&&<button onClick={()=>setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={12} className="text-gray-400"/></button>}</div>
      <div className="flex gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">{[['todos','Todos'],['etapa','Etapas'],['accion','Acciones'],['tarea','Tareas']].map(([v,l])=>(<button key={v} onClick={()=>setFtipo(v)} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${ftipo===v?'bg-guinda-500 text-white':'text-gray-500 hover:bg-gray-50'}`}>{l}</button>))}</div>
      <select value={festado} onChange={e=>setFestado(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-guinda-300"><option value="todos">Todos los estados</option><option value="Pendiente">Pendiente</option><option value="En_proceso">En proceso</option><option value="Bloqueada">Bloqueada</option><option value="Completada">Completada</option><option value="Cancelada">Cancelada</option></select>
      <select value={fproy} onChange={e=>setFproy(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-guinda-300 max-w-[180px]"><option value="todos">Todos los proyectos</option>{proyectos.map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select>
      <select value={frol} onChange={e=>setFrol(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-guinda-300"><option value="todos">Cualquier rol</option><option value="responsable">Responsable</option><option value="colaborador">Colaborador</option><option value="invitado">Invitado</option><option value="coordinador">Coordinando</option></select>
      {hasFiltros&&<button onClick={limpiarFiltros} className="text-xs text-guinda-600 hover:text-guinda-800 font-medium flex items-center gap-1"><X size={12}/>Limpiar</button>}
    </div>

    {filtrados.length===0?(<EmptyState icono={CalendarDays} titulo={items.length===0?'Sin actividades programadas':'Sin resultados'} subtitulo={items.length===0?'No tienes actividades con fecha asignada.':'Ajusta los filtros para ver mas actividades.'}/>):vista==='lista'?(<VistaLista grupos={grupos} onCambiado={cargar}/>):(<VistaCalendario modoCal={modoCal} setModoCal={setModoCal} diasCal={diasCal} diasSemana={diasSemana} ancla={ancla} setAncla={setAncla} dia={dia} setDia={setDia} itemsDia={itemsDia} itemsAncla={itemsAncla} onCambiado={cargar}/>)}
  </div>);
}

// ─── Vista Lista ──────────────────────────────────────────────────────
// Cada bucket de urgencia (Vencidas/Hoy/Esta semana/...) es su propia
// instancia de ArbolActividadesProyecto — agrupa internamente por
// proyecto, con árbol real y tarjetas accionables, en vez de la lista
// plana de solo lectura que había antes (Item/Grupo/corridasPorProyecto).
// Un proyecto con una acción vencida y otra por vencer esta semana
// aparece, legítimamente, en las dos secciones — el bucket es el eje
// organizador principal que se pidió conservar.
function BucketLista({g,onCambiado}){
  const[open,setOpen]=useState(g.id!=='fin');
  // Manual, no automático: arranca en 'completa', la usuaria decide si
  // compactar esta sección le sirve — nunca cambia sin que lo pida.
  const[densidad,setDensidad]=useState('completa');
  return(<div>
    <div className="flex items-center gap-2 mb-3">
      <button onClick={()=>setOpen(v=>!v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <g.I size={15} className={g.ic}/>
        <span className="text-sm font-semibold text-gray-700">{g.tit}</span>
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{g.items.length}</span>
        <ChevronDown size={13} className={`text-gray-400 ml-1 transition-transform ${open?'':'rotate-180'}`}/>
      </button>
      {open&&g.items.length>5&&(
        <button onClick={()=>setDensidad(d=>d==='completa'?'compacta':'completa')} className="flex-shrink-0 text-[11px] font-medium text-guinda-600 hover:text-guinda-800 border border-guinda-200 rounded-full px-2 py-0.5">
          {densidad==='completa'?'Ver compacto':'Ver completo'}
        </button>
      )}
    </div>
    {open&&<ArbolActividadesProyecto items={g.items} onCambiado={onCambiado} densidad={densidad} vacio="Sin actividades."/>}
  </div>);
}
function VistaLista({grupos,onCambiado}){
  return <div className="space-y-6">{grupos.map(g=><BucketLista key={g.id} g={g} onCambiado={onCambiado}/>)}</div>;
}

// Leyenda del calendario — construida desde LEYENDA_SEMAFORO/
// COLORES_SEMAFORO (misma fuente única que usa el resto de la plataforma)
// más el matiz propio de Agenda ("Vence hoy"). Antes era un arreglo
// hardcodeado con una escala vieja ("Próxima" en azul, de antes de
// unificar el semáforo real) que ya no correspondía a ningún color que
// los puntos pudieran tomar, y le faltaba "verde" — colores en la leyenda
// que nunca aparecían, y colores que aparecían sin estar en la leyenda.
function LeyendaSemaforo(){
  const filas=[
    {c:COLORES_SEMAFORO.rojo,l:LEYENDA_SEMAFORO.rojo},
    {c:COLOR_PUNTO.naranja,l:'Vence hoy'},
    {c:COLORES_SEMAFORO.ambar,l:LEYENDA_SEMAFORO.ambar},
    {c:COLORES_SEMAFORO.verde,l:LEYENDA_SEMAFORO.verde},
    {c:COLORES_SEMAFORO.gris,l:LEYENDA_SEMAFORO.gris},
  ];
  return(<div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-gray-400">
    {filas.map(f=><span key={f.l} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:f.c}}/>{f.l}</span>)}
  </div>);
}

function VistaCalendario({modoCal,setModoCal,diasCal,diasSemana,ancla,setAncla,dia,setDia,itemsDia,itemsAncla,onCambiado}){
  function prev(){setAncla(a=>modoCal==='mes'?addMeses(a,-1):modoCal==='semana'?addDias(a,-7):addDias(a,-1));setDia(null);}
  function next(){setAncla(a=>modoCal==='mes'?addMeses(a,1):modoCal==='semana'?addDias(a,7):addDias(a,1));setDia(null);}
  function irHoy(){setAncla(new Date());setDia(null);}

  // El panel de detalle se monta debajo del calendario y a menudo queda
  // fuera del viewport sin que el usuario note que apareció — se lleva
  // la vista hacia él en cuanto hay un día seleccionado con actividades
  // (mismo patrón que FichaNodo.jsx::irAFicha).
  const panelRef=useRef(null);
  useEffect(()=>{
    if(dia&&itemsDia.length>0)panelRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});
  },[dia,itemsDia.length]);

  const[densidadDia,setDensidadDia]=useState('completa');
  const[densidadAncla,setDensidadAncla]=useState('completa');
  // Se reinicia el modo compacto de "Día" cada vez que cambia el día
  // ancla — evita que quede compacto un día distinto al que se está viendo.
  useEffect(()=>{ setDensidadAncla('completa'); },[ancla]);

  const etiqueta=modoCal==='mes'
    ? `${MESES[ancla.getMonth()]} ${ancla.getFullYear()}`
    : modoCal==='semana'
      ? (()=>{const ini=inicioSemana(ancla);const fin=addDias(ini,6);return ini.getMonth()===fin.getMonth()
          ? `${ini.getDate()}–${fin.getDate()} ${MESES[ini.getMonth()]} ${fin.getFullYear()}`
          : `${ini.getDate()} ${MESES[ini.getMonth()].slice(0,3)} – ${fin.getDate()} ${MESES[fin.getMonth()].slice(0,3)} ${fin.getFullYear()}`;})()
      : ancla.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  return(<div className="space-y-4">
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} className="text-gray-500"/></button>
          <h2 className="text-base font-semibold text-gray-800">{etiqueta}</h2>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} className="text-gray-500"/></button>
          <button onClick={irHoy} className="text-xs text-guinda-600 font-medium px-2 py-0.5 rounded border border-guinda-200 hover:bg-guinda-50">Hoy</button>
        </div>
        {/* Mes/Semana/Día — nivel de zoom dentro del modelo "vista por
            fecha", distinto de Lista/Calendario (que es un modelo de
            contenido: urgencia vs. fecha exacta) — por eso vive aquí
            dentro, no como un botón más junto a Lista/Calendario. */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[{id:'mes',lbl:'Mes'},{id:'semana',lbl:'Semana'},{id:'dia',lbl:'Día'}].map(m=>(
            <button key={m.id} onClick={()=>{setModoCal(m.id);setDia(null);}} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${modoCal===m.id?'bg-white text-guinda-600 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>{m.lbl}</button>
          ))}
        </div>
      </div>

      {modoCal==='mes'&&(<>
        <div className="grid grid-cols-7 gap-px mb-1">{DIAS.map(d=><div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1.5 uppercase tracking-wide">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
          {diasCal.map((dc,i)=>{const esHoy=dc.esMes&&dc.str===HOY;const sel=dc.esMes&&dc.str===dia;const tiene=dc.items.length>0;return(
            <button key={i} onClick={()=>{if(!tiene||!dc.esMes)return;const next=sel?null:dc.str;setDia(next);if(next)setAncla(dc.fecha);}} className={`min-h-[78px] p-2 text-left flex flex-col transition-colors ${dc.esMes?'bg-white':'bg-gray-50/50'} ${tiene&&dc.esMes?'hover:bg-guinda-50/30 cursor-pointer':'cursor-default'} ${sel?'ring-2 ring-guinda-400 ring-inset':''}`}>
              <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${esHoy?'bg-guinda-500 text-white':dc.esMes?'text-gray-700':'text-gray-300'}`}>{dc.fecha.getDate()}</span>
              {tiene&&<div className="flex flex-wrap gap-0.5 mt-1">{dc.items.slice(0,4).map((it,j)=><span key={j} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:COLOR_PUNTO[ukey(it)]}} title={it.nombre}/>)}{dc.items.length>4&&<span className="text-[9px] text-gray-400 self-end">+{dc.items.length-4}</span>}</div>}
            </button>);})}
        </div>
        <LeyendaSemaforo/>
      </>)}

      {modoCal==='semana'&&(<>
        <div className="grid grid-cols-7 gap-2">
          {diasSemana.map((dc,i)=>{const esHoy=dc.str===HOY;const sel=dc.str===dia;return(
            <div key={i} className={`rounded-lg border p-2 min-h-[180px] flex flex-col gap-1 ${esHoy?'border-guinda-200 bg-guinda-50/30':'border-gray-100 bg-white'}`}>
              <button onClick={()=>{const next=sel?null:dc.str;setDia(next);if(next)setAncla(dc.fecha);}} className={`flex items-center justify-between mb-1 -mx-1 px-1 py-0.5 rounded ${sel?'bg-guinda-100':'hover:bg-gray-50'}`}>
                <span className="text-[10px] font-semibold text-gray-400 uppercase">{DIAS[i]}</span>
                <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${esHoy?'bg-guinda-500 text-white':'text-gray-700'}`}>{dc.fecha.getDate()}</span>
              </button>
              <div className="space-y-0.5 overflow-y-auto flex-1">
                {dc.items.length===0
                  ? <p className="text-[10px] text-gray-300 italic px-1">Sin actividades</p>
                  : dc.items.map(it=>(
                    <div key={`${it.tipo}-${it.id}`} className="flex items-center gap-1 px-1">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:COLOR_PUNTO[ukey(it)]}}/>
                      <span className="text-[10px] text-gray-600 truncate" title={it.nombre}>{it.nombre}</span>
                    </div>
                  ))}
              </div>
            </div>
          );})}
        </div>
        <LeyendaSemaforo/>
      </>)}
    </div>

    {/* Día: promueve el mismo panel accionable que ya usan Mes/Semana al
        seleccionar un día, a contenido principal — sin lista nueva. */}
    {modoCal==='dia'&&(<div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{itemsAncla.length} actividad{itemsAncla.length!==1?'es':''}</span>
        {itemsAncla.length>5&&(
          <button onClick={()=>setDensidadAncla(d=>d==='completa'?'compacta':'completa')} className="text-[11px] font-medium text-guinda-600 hover:text-guinda-800 border border-guinda-200 rounded-full px-2 py-0.5">
            {densidadAncla==='completa'?'Ver compacto':'Ver completo'}
          </button>
        )}
      </div>
      <ArbolActividadesProyecto items={itemsAncla} onCambiado={onCambiado} densidad={densidadAncla} vacio="Sin actividades para este día."/>
    </div>)}

    {/* Panel del día seleccionado (Mes/Semana) — mismo componente que
        "Mis actividades > Pendientes": agrupado por proyecto, árbol real
        Etapa › Acción › Tarea, tarjetas con Registrar avance/Reportar
        riesgo/etc. */}
    {modoCal!=='dia'&&dia&&itemsDia.length>0&&(
      <div ref={panelRef} className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">{(()=>{const[y,m,d]=dia.split('-').map(Number);return new Date(y,m-1,d);})().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}<span className="ml-2 text-xs font-normal text-gray-400">({itemsDia.length} actividad{itemsDia.length!==1?'es':''})</span></h3>
          <div className="flex items-center gap-2">
            {itemsDia.length>5&&(
              <button onClick={()=>setDensidadDia(d=>d==='completa'?'compacta':'completa')} className="text-[11px] font-medium text-guinda-600 hover:text-guinda-800 border border-guinda-200 rounded-full px-2 py-0.5">
                {densidadDia==='completa'?'Ver compacto':'Ver completo'}
              </button>
            )}
            <button onClick={()=>setDia(null)} className="p-1 rounded hover:bg-gray-100"><X size={14} className="text-gray-400"/></button>
          </div>
        </div>
        <ArbolActividadesProyecto items={itemsDia} onCambiado={onCambiado} densidad={densidadDia} vacio="Sin actividades para este día."/>
      </div>
    )}
  </div>);
}
