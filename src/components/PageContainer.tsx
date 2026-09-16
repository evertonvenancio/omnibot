import React from 'react';

export default function PageContainer({ children, scrollable = false }: { children: React.ReactNode; scrollable?: boolean }) {
  return (
    <div className={`bg-slate-950 text-slate-100 p-6 flex flex-col w-full ${scrollable ? 'min-h-screen overflow-y-auto' : 'h-screen overflow-hidden justify-between'}`}>
      {children}
    </div>
  );
}
