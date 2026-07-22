/**
 * ARCHIVO: Agenda.jsx
 * PROPÃ“SITO: PÃ¡gina de agenda con acciones pendientes del usuario,
 *            con vista de calendario (predeterminada) y vista de lista.
 *
 * MINI-CLASE: Agenda como vista personal de pendientes
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * La agenda muestra las acciones asignadas al usuario autenticado.
 * Tiene dos vistas intercambiables:
 * (1) Calendario â€” vista mensual con celdas por dÃ­a. Cada celda
 *     muestra dots o chips de las acciones que vencen ese dÃ­a.
 *     Al hacer click en un dÃ­a se expande para ver detalles.
 * (2) Lista â€” acciones agrupadas por urgencia (vencidas, esta semana,
 *     prÃ³ximas) como antes.
 * El calendario se muestra por defecto.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, List, ChevronLeft, ChevronRight, X, AlertCircle, Clock, CheckCircle2, Search, Layers, Target, CheckSquare, User, ChevronDown } from 'lucide-react';
import * as accionesApi from '../api/acciones';
import EstadoChip from '../components/common/EstadoChip';
import EmptyState from '../components/common/EmptyState';

const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const HOY=new Date().toISOString().slice(0,10);
const TIPO={
  etapa: {label:'Etapa', cls:'bg-indigo-100 text-indigo-700 border-indigo-200',   I:Layers},
  accion:{label:'Acción',cls:'bg-[#fbf3f6] text-[#7B1C3E] border-[#e8c7d3]',     I:Target},
  tarea: {label:'Tarea', cls:'bg-emerald-100 text-emerald-700 border-emerald-200',I:CheckSquare},
};
const ROL={
  colaborador:'bg-blue-50 text-blue-700 border border-blue-200',
  invitado:   'bg-gray-100 text-gray-600 border border-gray-200',
  coordinador:'bg-purple-50 text-purple-700 border border-purple-200',
};
const DOT={rojo:'bg-red-500',naranja:'bg-orange-500',ambar:'bg-amber-400',azul:'bg-blue-400',gris:'bg-gray-300'};
function norm(s){if(!s)return null;return String(s).slice(0,10);}
function pFecha(s){if(!s)return null;const str=norm(s);const[y,m,d]=str.split('-').map(Number);if(!y||!m||!d)return null;return new Date(y,m-1,d);}
function diff(s){if(!s)return null;const h=new Date();h.setHours(0,0,0,0);const t=pFecha(s);if(!t)return null;return Math.ceil((t-h)/86400000);}
function fmt(s){if(!s)return '--';const d=pFecha(s);return d?d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}):'-';}
function ukey(it){
  if(it.estado==='Completada'||it.estado==='Cancelada')return'gris';
  const d=diff(it.fecha_fin);return d===null?'gris':d<0?'rojo':d===0?'naranja':d<=7?'ambar':'azul';
}

export default function Agenda(){
  const[items,setItems]=useState([]);
  const[load,setLoad]=useState(true);
  const[vista,setVista]=useState('calendario');
  const[mes,setMes]=useState(()=>{const h=new Date();return new Date(h.getFullYear(),h.getMonth(),1);});
  const[dia,setDia]=useState(null);
  const[ftipo,setFtipo]=useState('todos');
  const[festado,setFestado]=useState('todos');
  const[q,setQ]=useState('');

  useEffect(()=>{
    accionesApi.obtenerAgenda().then(r=>setItems((r.datos||[]).map(i=>({...i,fecha_fin:norm(i.fecha_fin)})))).catch(console.error).finally(()=>setLoad(false));
  },[]);

  const filtrados=useMemo(()=>items.filter(it=>{
    if(ftipo!=='todos'&&it.tipo!==ftipo)return false;
    if(festado!=='todos'&&it.estado!==festado)return false;
    if(q){const sq=q.toLowerCase();return(it.nombre||'').toLowerCase().includes(sq)||(it.proyecto_nombre||'').toLowerCase().includes(sq);}
    return true;
  }),[items,ftipo,festado,q]);

  const stats=useMemo(()=>{
    const act=items.filter(i=>i.estado!=='Completada'&&i.estado!=='Cancelada');
    return{total:items.length,venc:act.filter(i=>(diff(i.fecha_fin)??0)<0).length,hoy:items.filter(i=>i.fecha_fin===HOY).length,sem:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>0&&d<=7;}).length};
  },[items]);

  const grupos=useMemo(()=>{
    const act=filtrados.filter(i=>i.estado!=='Completada'&&i.estado!=='Cancelada');
    const fin=filtrados.filter(i=>i.estado==='Completada'||i.estado==='Cancelada');
    const asc=(a,b)=>(a.fecha_fin||'')<(b.fecha_fin||'')?-1:1;
    return[
      {id:'venc',tit:'Vencidas',    I:AlertCircle, ic:'text-red-500',   items:act.filter(i=>(diff(i.fecha_fin)??0)<0).sort(asc)},
      {id:'hoy', tit:'Hoy',         I:Clock,       ic:'text-orange-500',items:act.filter(i=>i.fecha_fin===HOY)},
      {id:'sem', tit:'Esta semana', I:CalendarDays,ic:'text-amber-500', items:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>0&&d<=7;}).sort(asc)},
      {id:'mes', tit:'Este mes',    I:CalendarDays,ic:'text-blue-500',  items:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>7&&d<=30;}).sort(asc)},
      {id:'prox',tit:'PrÃ³ximas',    I:CalendarDays,ic:'text-green-500', items:act.filter(i=>{const d=diff(i.fecha_fin);return d!==null&&d>30;}).sort(asc)},
      {id:'fin', tit:'Finalizadas', I:CheckCircle2,ic:'text-gray-400',  items:fin.sort((a,b)=>(b.fecha_fin||'')<(a.fecha_fin||'')?-1:1)},
    ].filter(g=>g.items.length>0);
  },[filtrados]);

  const diasCal=useMemo(()=>{
    const a=mes.getFullYear(),m=mes.getMonth();
    const ini=new Date(a,m,1);const fin=new Date(a,m+1,0);
    let off=ini.getDay()-1;if(off<0)off=6;
    const ds=[];
    for(let i=off-1;i>=0;i--)ds.push({fecha:new Date(a,m,-i),esMes:false,str:null,items:[]});
    for(let d=1;d<=fin.getDate();d++){const str=`${a}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;ds.push({fecha:new Date(a,m,d),esMes:true,str,items:filtrados.filter(i=>i.fecha_fin===str)});}
    let ex=1;while(ds.length%7!==0)ds.push({fecha:new Date(a,m+1,ex++),esMes:false,str:null,items:[]});
    return ds;
  },[mes,filtrados]);

  const itemsDia=useMemo(()=>dia?filtrados.filter(i=>i.fecha_fin===dia):[],[dia,filtrados]);
  const hasFiltros=ftipo!=='todos'||festado!=='todos'||!!q;

  if(load)return(<div className="space-y-4 animate-pulse"><div className="h-8 bg-gray-200 rounded w-1/3"/>{[1,2,3].map(i=><div key={i} className="h-14 bg-gray-200 rounded"/>)}</div>);
  return(<div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">Agenda</h1><p className="text-sm text-gray-500 mt-0.5">Actividades con fecha — responsable, colaborador o coordinador de proyecto</p></div><div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">{[{id:'lista',lbl:'Lista',I:List},{id:'calendario',lbl:'Calendario',I:CalendarDays}].map(({id,lbl,I})=>(<button key={id} onClick={()=>{setVista(id);setDia(null);}} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${vista===id?'bg-white text-guinda-600 shadow-sm':'text-gray-500 hover:text-gray-700'}`}><I size={13}/>{lbl}</button>))}</div></div>
    {items.length>0&&(<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[{lbl:'Total',val:stats.total,cls:'text-gray-800',bg:'bg-white border-gray-200'},{lbl:'Vencidas',val:stats.venc,cls:stats.venc>0?'text-red-600 font-bold':'text-gray-800',bg:stats.venc>0?'bg-red-50 border-red-200':'bg-white border-gray-200'},{lbl:'Hoy',val:stats.hoy,cls:stats.hoy>0?'text-orange-600 font-bold':'text-gray-800',bg:stats.hoy>0?'bg-orange-50 border-orange-200':'bg-white border-gray-200'},{lbl:'Esta semana',val:stats.sem,cls:'text-gray-800',bg:'bg-white border-gray-200'}].map(s=>(<div key={s.lbl} className={`card p-3.5 border ${s.bg}`}><div className={`text-2xl font-bold ${s.cls}`}>{s.val}</div><div className="text-xs text-gray-500 mt-0.5">{s.lbl}</div></div>))}</div>)}
    <div className="flex flex-wrap gap-2 items-center"><div className="relative min-w-44 max-w-56 flex-1"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/><input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar actividades..." className="w-full pl-7 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-guinda-300"/>{q&&<button onClick={()=>setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={12} className="text-gray-400"/></button>}</div><div className="flex gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">{[['todos','Todos'],['etapa','Etapas'],['accion','Acciones'],['tarea','Tareas']].map(([v,l])=>(<button key={v} onClick={()=>setFtipo(v)} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${ftipo===v?'bg-guinda-500 text-white':'text-gray-500 hover:bg-gray-50'}`}>{l}</button>))}</div><select value={festado} onChange={e=>setFestado(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-guinda-300"><option value="todos">Todos los estados</option><option value="Pendiente">Pendiente</option><option value="En_proceso">En proceso</option><option value="Bloqueada">Bloqueada</option><option value="Completada">Completada</option><option value="Cancelada">Cancelada</option></select>{hasFiltros&&<button onClick={()=>{setFtipo('todos');setFestado('todos');setQ('');}} className="text-xs text-guinda-600 hover:text-guinda-800 font-medium flex items-center gap-1"><X size={12}/>Limpiar</button>}</div>
    {filtrados.length===0?(<EmptyState icono={CalendarDays} titulo={items.length===0?'Sin actividades programadas':'Sin resultados'} subtitulo={items.length===0?'No tienes actividades con fecha asignada.':'Ajusta los filtros para ver mas actividades.'}/>):vista==='lista'?(<VistaLista grupos={grupos}/>):(<VistaCalendario diasCal={diasCal} mes={mes} setMes={setMes} dia={dia} setDia={setDia} itemsDia={itemsDia}/>)}
  </div>);
}
function Item({it}){
  const cfg=TIPO[it.tipo]||TIPO.accion;const d=diff(it.fecha_fin);
  const venc=d!==null&&d<0&&it.estado!=='Completada'&&it.estado!=='Cancelada';
  return(
    <div className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all hover:shadow-sm ${venc?'bg-red-50/60 border-red-200':'bg-white border-gray-200 hover:border-guinda-200'}`}>
      <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center border ${cfg.cls}`}><cfg.I size={14}/></div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-tight ${cfg.cls}`}>{cfg.label}</span>
          {it.mi_rol&&it.mi_rol!=='responsable'&&<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded leading-tight ${ROL[it.mi_rol]||''}`}>{it.mi_rol==='colaborador'?'Colaborador':it.mi_rol==='invitado'?'Invitado':'Coordinando'}</span>}
        </div>
        <p className={`text-sm font-semibold leading-snug ${venc?'text-red-900':'text-gray-900'}`}>{it.nombre}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap text-xs text-gray-400">
          {it.proyecto_nombre&&<Link to={`/proyectos/${it.proyecto_id}`} className="text-guinda-600 hover:underline font-medium truncate max-w-[150px]" onClick={e=>e.stopPropagation()}>{it.proyecto_nombre}</Link>}
          {it.etapa_nombre&&<><span>&#x203A;</span><span className="truncate max-w-[110px]">{it.etapa_nombre}</span></>}
          {it.accion_nombre&&<><span>&#x203A;</span><span className="truncate max-w-[110px]">{it.accion_nombre}</span></>}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div style={{width:`${it.avance_actual||0}%`}} className={`h-full rounded-full ${it.estado==='Completada'?'bg-green-500':it.semaforo==='rojo'?'bg-red-400':it.semaforo==='ambar'?'bg-amber-400':'bg-guinda-400'}`}/></div>
          <span className="text-xs text-gray-500 w-8 text-right">{it.avance_actual||0}%</span>
        </div>
        {it.mi_rol==='coordinador'&&it.responsable_nombre&&<div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500"><User size={10} className="text-purple-400"/><span>{it.responsable_nombre}</span></div>}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-1">
        <EstadoChip estado={it.estado}/>
        <span className={`text-xs font-medium ${d!==null&&d<0&&it.estado!=='Completada'?'text-red-600':d===0?'text-orange-600':d!==null&&d<=7?'text-amber-600':'text-gray-400'}`}>{fmt(it.fecha_fin)}</span>
        {d!==null&&it.estado!=='Completada'&&it.estado!=='Cancelada'&&<span className={`text-[10px] ${d<0?'text-red-500':d===0?'text-orange-500':d<=7?'text-amber-500':'text-gray-400'}`}>{d<0?`Hace ${Math.abs(d)}d`:d===0?'Hoy':`En ${d}d`}</span>}
      </div>
    </div>
  );
}
function Grupo({g}){
  const[open,setOpen]=useState(g.id!=='fin');
  return(<div><button onClick={()=>setOpen(v=>!v)} className="w-full flex items-center gap-2 mb-3"><g.I size={15} className={g.ic}/><span className="text-sm font-semibold text-gray-700">{g.tit}</span><span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{g.items.length}</span><ChevronDown size={13} className={`text-gray-400 ml-auto transition-transform ${open?'':'rotate-180'}`}/></button>{open&&<div className="space-y-2">{g.items.map(i=><Item key={`${i.tipo}-${i.id}`} it={i}/>)}</div>}</div>);
}
function VistaLista({grupos}){return <div className="space-y-6">{grupos.map(g=><Grupo key={g.id} g={g}/>)}</div>;}
function VistaCalendario({diasCal,mes,setMes,dia,setDia,itemsDia}){
  function prev(){setMes(p=>new Date(p.getFullYear(),p.getMonth()-1,1));setDia(null);}
  function next(){setMes(p=>new Date(p.getFullYear(),p.getMonth()+1,1));setDia(null);}
  function irHoy(){const h=new Date();setMes(new Date(h.getFullYear(),h.getMonth(),1));setDia(null);}
  return(<div className="space-y-4"><div className="card p-4">
    <div className="flex items-center justify-between mb-4">
      <button onClick={prev} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} className="text-gray-500"/></button>
      <div className="flex items-center gap-3"><h2 className="text-base font-semibold text-gray-800">{MESES[mes.getMonth()]} {mes.getFullYear()}</h2><button onClick={irHoy} className="text-xs text-guinda-600 font-medium px-2 py-0.5 rounded border border-guinda-200 hover:bg-guinda-50">Hoy</button></div>
      <button onClick={next} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} className="text-gray-500"/></button>
    </div>
    <div className="grid grid-cols-7 gap-px mb-1">{DIAS.map(d=><div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1.5 uppercase tracking-wide">{d}</div>)}</div>
    <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
      {diasCal.map((dc,i)=>{const esHoy=dc.esMes&&dc.str===HOY;const sel=dc.esMes&&dc.str===dia;const tiene=dc.items.length>0;return(
        <button key={i} onClick={()=>tiene&&dc.esMes&&setDia(sel?null:dc.str)} className={`min-h-[78px] p-2 text-left flex flex-col transition-colors ${dc.esMes?'bg-white':'bg-gray-50/50'} ${tiene&&dc.esMes?'hover:bg-guinda-50/30 cursor-pointer':'cursor-default'} ${sel?'ring-2 ring-guinda-400 ring-inset':''}`}>
          <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${esHoy?'bg-guinda-500 text-white':dc.esMes?'text-gray-700':'text-gray-300'}`}>{dc.fecha.getDate()}</span>
          {tiene&&<div className="flex flex-wrap gap-0.5 mt-1">{dc.items.slice(0,4).map((it,j)=><span key={j} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[ukey(it)]}`} title={it.nombre}/>)}{dc.items.length>4&&<span className="text-[9px] text-gray-400 self-end">+{dc.items.length-4}</span>}</div>}
        </button>);})}
    </div>
    <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-gray-400">{[['bg-red-500','Vencida'],['bg-orange-500','Hoy'],['bg-amber-400','Esta semana'],['bg-blue-400','Próxima'],['bg-gray-300','Finalizada']].map(([c,l])=><span key={l} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${c}`}/>{l}</span>)}</div>
  </div>
  {dia&&itemsDia.length>0&&<div className="card p-4"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-gray-700">{(()=>{const[y,m,d]=dia.split('-').map(Number);return new Date(y,m-1,d);})().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}<span className="ml-2 text-xs font-normal text-gray-400">({itemsDia.length} actividad{itemsDia.length!==1?'es':''})</span></h3><button onClick={()=>setDia(null)} className="p-1 rounded hover:bg-gray-100"><X size={14} className="text-gray-400"/></button></div><div className="space-y-2">{itemsDia.map(it=><Item key={`${it.tipo}-${it.id}`} it={it}/>)}</div></div>}
  </div>);
}