import Navbar from './Navbar.jsx'

export default function ThreeColumnLayout({ leftPanel, centerPanel, rightPanel, workspaceName }) {
  return (
    <div className="flex flex-col h-full">
      <Navbar workspaceName={workspaceName} />

      <main className="flex flex-1 flex-col lg:flex-row gap-3 p-3 min-h-0 overflow-auto lg:overflow-hidden">
        <aside className="w-full lg:w-64 lg:shrink-0 flex flex-col min-h-64 lg:min-h-0">
          {leftPanel}
        </aside>

        <section className="flex-1 flex flex-col min-w-0 min-h-[36rem] lg:min-h-0">
          {centerPanel}
        </section>

        <aside className="w-full lg:w-80 lg:shrink-0 flex flex-col min-h-80 lg:min-h-0">
          {rightPanel}
        </aside>
      </main>
    </div>
  )
}
