import React from 'react';

type StageBoxProps = {
  title: string;
  count: number;
  href: string;
};

export default function StageBox({ title, count, href }: StageBoxProps) {
  return (
    <a href={href} className="flex justify-between items-center bg-slate-800 border border-slate-700 rounded-lg p-3 hover:bg-slate-700 transition">
      <span className="text-base font-semibold text-white">{title}</span>
      <span className="text-xl font-bold text-white">{count}</span>
    </a>
  );
}