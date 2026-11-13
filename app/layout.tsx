import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'RESCOM | San Nicolas',description:'Evacuation coordination and monitoring for San Nicolas, Ilocos Norte.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
