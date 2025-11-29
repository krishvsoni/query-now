'use client';
import { useEffect, useState } from 'react'
import { UploadCloud, FileText, Brain, Database, List, Search, Check } from 'lucide-react'

interface ProcessingDocument {
    id: number
    stage: number
    progress: number
}

export function DocumentProcessor() {
    const [documents, setDocuments] = useState<ProcessingDocument[]>([])
    const [mounted, setMounted] = useState(false)
    const [docsProcessed, setDocsProcessed] = useState(0)

    useEffect(() => {
        setMounted(true)
        setDocsProcessed(Math.floor(Math.random() * 50) + 150)
        
        const activeDocuments: ProcessingDocument[] = []
        
        for (let i = 0; i < 4; i++) {
            activeDocuments.push({
                id: i,
                stage: (Math.floor(Date.now() / 400) + i * 2) % 7,
                progress: ((Date.now() / 400) % 1) * 100
            })
        }
        
        setDocuments(activeDocuments)
    }, [])

    useEffect(() => {
        const interval = setInterval(() => {
            setDocuments(prev => 
                prev.map(doc => ({
                    ...doc,
                    stage: (doc.stage + 1) % 7
                }))
            )
        }, 800)

        return () => clearInterval(interval)
    }, [])

const stages = [
        { name: 'Upload', icon: <UploadCloud className="w-6 h-6" />, color: 'from-yellow-400' },
        { name: 'Extract', icon: <FileText className="w-6 h-6" />, color: 'from-yellow-300' },
        { name: 'Embed', icon: <Brain className="w-6 h-6" />, color: 'from-yellow-400' },
        { name: 'Store', icon: <Database className="w-6 h-6" />, color: 'from-yellow-300' },
        { name: 'Index', icon: <List className="w-6 h-6" />, color: 'from-yellow-400' },
        { name: 'Query', icon: <Search className="w-6 h-6" />, color: 'from-yellow-300' },
]

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-8">
            <div className="relative w-full max-w-5xl">
                <div className="absolute top-16 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-400/40 to-transparent overflow-hidden">
                    <div className="absolute inset-0 h-full w-1/2 bg-gradient-to-r from-transparent to-yellow-400/60 animate-pulse" />
                </div>

                <div className="flex justify-between mb-20 relative z-10">
                    {stages.map((stage, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-3">
                            <div className="relative">
                                <div className="w-14 h-14 rounded-full border-2 border-yellow-400/30 bg-gradient-to-br from-yellow-400/20 to-yellow-500/10 flex items-center justify-center text-2xl hover:border-yellow-400/60 transition-all duration-300 hover:shadow-lg hover:shadow-yellow-400/20">
                                    {stage.icon}
                                </div>
                                <div className="absolute inset-0 rounded-full blur-md bg-yellow-400/10 animate-pulse -z-10" />
                            </div>
                            <span className="text-xs font-semibold text-yellow-200/70 whitespace-nowrap">{stage.name}</span>
                        </div>
                    ))}
                </div>

                <svg className="absolute top-0 left-0 w-full" height="120" viewBox={`0 0 ${stages.length * 200} 120`} preserveAspectRatio="xMidYMid slice">
                    <defs>
                        <filter id="doc-glow">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {documents.map((doc) => {
                        const xPos = 50 + (doc.stage * 200)
                        const yPos = 60
                        const opacity = doc.stage === 6 ? 0 : 1

                        return (
                            <g key={doc.id} filter="url(#doc-glow)" opacity={opacity}>
                                <rect 
                                    x={xPos - 18} 
                                    y={yPos - 24} 
                                    width="36" 
                                    height="48" 
                                    rx="3"
                                    fill="rgba(234, 179, 8, 0.8)"
                                    style={{
                                        transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                                    }}
                                />
                                <line x1={xPos - 12} y1={yPos - 12} x2={xPos + 12} y2={yPos - 12} stroke="rgba(20, 20, 20, 0.6)" strokeWidth="1.5" />
                                <line x1={xPos - 12} y1={yPos - 4} x2={xPos + 12} y2={yPos - 4} stroke="rgba(20, 20, 20, 0.6)" strokeWidth="1.5" />
                                <line x1={xPos - 12} y1={yPos + 4} x2={xPos + 12} y2={yPos + 4} stroke="rgba(20, 20, 20, 0.6)" strokeWidth="1.5" />
                                <circle 
                                    cx={xPos} 
                                    cy={yPos} 
                                    r="24" 
                                    fill="none" 
                                    stroke="rgba(234, 179, 8, 0.3)" 
                                    strokeWidth="1"
                                />
                            </g>
                        )
                    })}
                </svg>

                <div className="mt-32 pt-8 border-t border-yellow-400/20 grid grid-cols-3 gap-6">
                    <div className="text-left">
                        <div className="text-3xl font-bold text-yellow-400">
                            {mounted ? docsProcessed : 0}
                        </div>
                        <div className="text-sm text-yellow-200/60">Docs Processing</div>
                    </div>
                    <div className="col-start-3 text-right pr-4">
                        <div className="text-3xl font-bold text-yellow-400">3072D</div>
                        <div className="text-sm text-yellow-200/60">Vectors</div>
                    </div>
                 
                </div>
            </div>
        </div>
    )
}
