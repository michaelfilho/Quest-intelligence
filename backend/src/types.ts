import type { DemoModules } from './modules.js';
export interface Financial { revenue:number; contracted:number; invoiced:number; received:number; labor:number; external:number; tax:number; indirect:number; cost:number; profit:number; margin:number|null; hours:number; planned:number; rework:number; jobs:number }
export interface Client { id:string; name:string; segment:string; status:string }
export interface Department { id:string; name:string; capacity:number }
export interface Person { id:string; name:string; role:string; departmentId:string; rate:number }
export interface Brand { id:string; name:string; clientId:string }
export interface Category { id:string; name:string }
export interface Contract { id:string; name:string; clientId:string; brandId:string; categoryId:string; type:string; status:string; value:number; start:string; end:string; versions:{version:number; date:string; value:number; description:string}[] }
export interface Allocation { id:string; contractId:string; projectId:string; amount:number }
export interface Project { id:string; code:string; name:string; clientId:string; brandId:string; contractId:string; departmentId:string; ownerId:string; status:string; revenue:number; contracted:number; invoiced:number; received:number; external:number; tax:number; indirect:number; planned:number; due:string }
export interface Entry { id:string; projectId:string; personId:string; date:string; hours:number; rework:boolean; activity:string; piece:string; description:string; start:string; end:string }
export interface FinancialEntry { id:string; projectId:string; clientId:string; date:string; type:string; amount:number }
export interface DemoData { clients:Client[]; departments:Department[]; people:Person[]; brands:Brand[]; categories:Category[]; contracts:Contract[]; allocations:Allocation[]; projects:Project[]; entries:Entry[]; financialEntries:FinancialEntry[] }
export type ProjectRow = Project & Financial;
export type ClientRow = Client & Financial;
export type PersonRow = Person & Financial;
export type DepartmentRow = Department & Financial;
export type BrandRow = Brand & Financial;
export interface Alert { title:string; label:string; description:string; severity:string; target:string }
export interface StrategicIndicator { id:string; name:string; value:number|null; unit:'percent'|'money'; target:number; direction:'above'|'below'; description:string; path:string }
export interface ManagementAlert { id:string; title:string; entity:string; category:string; severity:'red'|'amber'|'blue'; evidence:string; recommendation:string; path:string }
export interface Piece { id:string; projectId:string; clientId:string; personIds:string[]; departmentIds:string[]; entryIds:string[]; activity:string; date:string; hours:number; labor:number; rework:number }
export interface Executive { indicators:StrategicIndicator[]; managementAlerts:ManagementAlert[]; pieces:Piece[] }
export interface Bootstrap extends DemoData { modules:DemoModules; projectRows:ProjectRow[]; clientRows:ClientRow[]; personRows:PersonRow[]; departmentRows:DepartmentRow[]; brandRows:BrandRow[]; totals:Financial; monthly:{month:string; revenue:number; cost:number}[]; alerts:Alert[]; executive:Executive; meta:{mode:string; version:string; period:string} }
