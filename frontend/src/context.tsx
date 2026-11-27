import { createContext,useContext } from 'react';
import type { Bootstrap } from '../../backend/src/types';
export const DataContext=createContext<Bootstrap|null>(null);
export function useData(){const value=useContext(DataContext);if(!value)throw new Error('Dados indisponíveis');return value;}
