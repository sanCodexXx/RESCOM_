'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, ArrowDownUp, Download } from 'lucide-react';
import { Button, Empty, Pagination } from './ui';
export type Column={key:string;title:string;render?:(row:any)=>ReactNode;sortable?:boolean;className?:string};
export default function DataTable({rows,columns,search='',onSearch,filters,emptyTitle,emptyText,emptyAction,onExport,title,subtitle,initialSize=10}:any){
 const [page,setPage]=useState(1),[size,setSize]=useState(initialSize),[sort,setSort]=useState({key:'',dir:1});
 useEffect(()=>{setPage(1);},[search,rows.length]);
 const sorted=useMemo(()=>sort.key?[...rows].sort((a,b)=>{const x=a[sort.key]??'',y=b[sort.key]??'';return (typeof x==='number'?x-y:String(x).localeCompare(String(y)))*sort.dir;}):rows,[rows,sort]);
 const current=Math.min(page,Math.max(1,Math.ceil(sorted.length/size))),visible=sorted.slice((current-1)*size,current*size);
 return <section className="table-card">{title&&<div className="panel-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div></div>}<div className="table-toolbar"><div className="table-search"><Search size={17}/><input aria-label="Search this table" placeholder="Search records..." value={search} onChange={e=>onSearch?.(e.target.value)}/>{search&&<button className="text-btn" aria-label="Clear table search" onClick={()=>onSearch?.('')}>Clear</button>}</div><div className="table-filters">{filters}{onExport&&<Button variant="secondary" onClick={()=>onExport(sorted)} disabled={!sorted.length}><Download size={15}/><span>Export</span></Button>}</div></div>{!visible.length?<Empty title={emptyTitle||'No matching records'} text={emptyText||'Try another search or adjust your filters.'} action={emptyAction}/>:<div className="table-scroll"><table><thead><tr>{columns.map((c:Column)=><th key={c.key} className={c.className}>{c.sortable?<button onClick={()=>setSort({key:c.key,dir:sort.key===c.key?-sort.dir:1})}>{c.title}<ArrowDownUp size={12}/></button>:c.title}</th>)}</tr></thead><tbody>{visible.map((r:any)=><tr key={r.id}>{columns.map((c:Column)=><td key={c.key} className={c.className}>{c.render?c.render(r):r[c.key]}</td>)}</tr>)}</tbody></table></div>}<Pagination page={current} setPage={setPage} total={sorted.length} size={size} setSize={setSize}/></section>;
}
