import React from 'react';

type CounterBoxProps = {
  title: string;
  count: number;
  href: string;
};

export default function CounterBox({ title, count, href }: CounterBoxProps) {
  return (
    <a href={href} className="block bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl text-center hover:bg-slate-800 transition">
      <div className="text-sm text-slate-400 mb-1">{title}</div>
      <div className="text-xl font-bold text-white">{count}</div>
    </a>
  );
}