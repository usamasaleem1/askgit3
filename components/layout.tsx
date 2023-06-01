import React from 'react';

interface LayoutProps {
  children?: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="mx-auto flex flex-col space-y-4">
      <header
        className="container sticky top-0 z-40 backdrop-filter backdrop-blur-sm"
        style={{
          minWidth: '100%',
          backgroundColor: '#0031470A',
          boxShadow: '0 2px 40px #00304738', // Adding box shadow
          left: 0,
        }}
      >
        <div className="h-16 border-b border-b-slate-200 py-5">
          <nav className="ml-4 pl-6">
            <a href="#" className="hover:text-slate-600 cursor-pointer">
              AskGit
            </a>
          </nav>
        </div>
      </header>
      <div>
        <main className="flex w-full flex-1 flex-col overflow-hidden py-5">
          {children}
        </main>
      </div>
    </div>
  );
}
