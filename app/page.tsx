'use client'

import { RegisterLink, LoginLink } from "@kinde-oss/kinde-auth-nextjs/components"
import { ArrowRight, Zap, Brain, MessageSquare, Upload,ShipWheel,Feather, BookOpenText,Search, Database, Sparkles, ChevronRight, Check, Rocket ,FileStack} from 'lucide-react'
import { useEffect, useState } from 'react'
import { DocumentProcessor } from '../components/DocumentProcessor'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
const demoVideo = '/demoVideo.mp4'
export default function Home() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [scrollY, setScrollY] = useState(0)
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)
  const [processedDocs, setProcessedDocs] = useState(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    const handleScroll = () => {
      setScrollY(window.scrollY)
    }

    const interval = setInterval(() => {
      setProcessedDocs(prev => (prev + 1) % 12)
    }, 400)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('scroll', handleScroll)

    return () => {
      clearInterval(interval)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const features = [
    {
      icon: Upload,
      title: "Smart Upload",
      description: "Upload PDF, DOCX, and TXT files with automatic text extraction and intelligent processing."
    },
    {
      icon: Brain,
      title: "AI Processing",
      description: "Advanced embeddings, knowledge graphs, and entity extraction for deep document understanding."
    },
    {
      icon: MessageSquare,
      title: "Intelligent Chat",
      description: "Ask natural language questions and get contextual answers from your knowledge base."
    },
    {
      icon: Search,
      title: "Semantic Search",
      description: "Find relevant documents and passages with semantic understanding, not just keyword matching."
    },
    {
      icon: Database,
      title: "Vector Store",
      description: "Fast vector database storage with optimized retrieval for lightning-quick responses."
    },
    {
      icon: Zap,
      title: "Real-time Sync",
      description: "Live updates and instant processing with Redis-backed caching for optimal performance."
    }
  ]

  const pipelineSteps = ["Document Upload", "Text Extraction", "Embeddings", "Vector Storage", "Knowledge Graph", "Semantic Index", "Query Processing", "Response Generation"]

  const benefits = [
    "MultiDoc Search",
    "Smart Document Parsing",
    "Best for Students and Researchers",
    "Knowledge Graph Integration",
    "Cypher Query Support"
  ]

  useEffect(() => {
    const video = document.getElementById('hero-demo-video') as HTMLVideoElement;

    if (video) {
      const segments = [
        { start: 0,      end: 28 },    // 0–28s
        { start: 72,     end: 77 },    // 1:12 (72s) → play for 5 seconds
        { start: 146,    end: video.duration || 999999 } // 2:26 → end
      ];

      let currentSegment = 0;
      let isTransitioning = false;

      const playSegment = () => {
        if (isTransitioning) return;
        isTransitioning = true;
        
        const seg = segments[currentSegment];
        video.currentTime = seg.start;
        video.play().then(() => {
          isTransitioning = false;
        }).catch(() => {
          isTransitioning = false;
        });
      };

      const handleTimeUpdate = () => {
        const seg = segments[currentSegment];
        
        if (video.currentTime >= seg.end && !isTransitioning) {
          currentSegment++;
          
          if (currentSegment >= segments.length) {
            // Loop back to start
            currentSegment = 0;
          }
          
          playSegment();
        }
      };

      const handleLoadedMetadata = () => {
        // Update last segment end with actual duration
        segments[2].end = video.duration;
        playSegment();
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('timeupdate', handleTimeUpdate);

      // Cleanup
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
  }, [])
  return (
    <main className="min-h-screen bg-background text-foreground overflow-hidden">
      <div
        className="pointer-events-none fixed w-40 h-40 rounded-full bg-gradient-to-br from-primary/40 to-accent/20 blur-3xl transition-all duration-500 ease-out"
        style={{
          left: `${mousePosition.x - 80}px`,
          top: `${mousePosition.y - 80}px`,
          willChange: 'transform'
        }}
      />

      <Navbar />

      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 py-20 overflow-hidden">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/15 rounded-full blur-3xl animate-float" style={{ willChange: 'transform' }} />
        <div className="absolute bottom-20 left-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s', willChange: 'transform' }} />
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-primary/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s', willChange: 'transform' }} />

        <div className="relative z-10 max-w-5xl mx-auto text-center animate-slide-down">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-primary/40 bg-primary/10 backdrop-blur-sm hover:bg-primary/20 transition-colors">
           <FileStack className="w-5 h-5 text-primary animate-pulse" />
            <span className="text-sm font-semibold text-primary">MultiDoc Intelligence</span>
          </div>

          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black mb-6 leading-tight text-balance">
            Search In Your
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary animate-pulse duration-3000">
              Documents
            </span>
            <br />
            Instantly
          </h1>

          <p className="text-lg sm:text-lg text-muted-foreground mb-10 max-w-md mx-auto leading-relaxed text-pretty">
            Upload your documents, process them, and have smart conversations with your knowledge base.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <RegisterLink className="group w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold hover:shadow-2xl hover:shadow-primary/40 flex items-center justify-center gap-2 transition-all duration-300 border border-primary/50">
              Start Querying
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </RegisterLink>
            <LoginLink className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-primary/50 text-foreground hover:bg-primary/10 hover:border-primary/80 font-bold transition-all duration-300">
              Create Account
            </LoginLink>
          </div>

          <div className="grid grid-cols-3 gap-4 sm:gap-6 max-w-3xl mx-auto mb-8">
            {[
              { value: "10M+", label: "Docs Processed", delay: "0ms" },
              { value: "99.9%", label: "Uptime", delay: "100ms" },
              { value: "<50ms", label: "Query Speed", delay: "200ms" }
            ].map((stat, idx) => (
              <div
                key={idx}
                className="p-6 rounded-xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-md hover:border-primary/60 hover:from-card/80 transition-all duration-300 animate-fade-in group cursor-default"
                style={{ animationDelay: stat.delay, willChange: 'transform' }}
              >
                <div className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent mb-2 group-hover:scale-110 transition-transform duration-300">
                  {stat.value}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-t border-primary/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 animate-fade-in">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full border border-primary/30 bg-primary/10">
              <Feather  className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Features</span>
            </div>
            <h2 className="text-5xl sm:text-6xl font-black mb-4 text-balance">
              Powerful Features for <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Modern Teams</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Everything you need for intelligent document processing and analysis</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => {
              const Icon = feature.icon
              return (
                <div
                  key={idx}
                  className="group relative p-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-card/50 to-card/20 backdrop-blur-sm hover:border-primary/60 hover:from-card/80 transition-all duration-300 animate-fade-in overflow-hidden"
                  style={{ animationDelay: `${idx * 75}ms`, willChange: 'transform' }}
                  onMouseEnter={() => setHoveredCard(idx)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-accent/0 group-hover:from-primary/10 group-hover:to-accent/5 transition-all duration-300 pointer-events-none" />

                  <div className="relative z-10">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mb-6 group-hover:from-primary/60 group-hover:to-accent/40 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/30">
                      <Icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors duration-300">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>

                    <div className="flex items-center gap-2 mt-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-t border-primary/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-5xl sm:text-6xl font-black mb-4 text-balance">
              Intelligent Processing <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Pipeline</span>
            </h2>
            <p className="text-lg text-muted-foreground">Complete end-to-end RAG pipeline with redundancy and optimization</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pipelineSteps.map((step, idx) => (
              <div
                key={idx}
                className="relative group animate-fade-in"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="p-5 rounded-xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-sm group-hover:border-primary/70 group-hover:from-card/80 transition-all duration-300 cursor-pointer h-full flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground flex items-center justify-center text-xs font-black">{idx + 1}</div>
                  <span className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">{step}</span>
                </div>

                {idx < pipelineSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-2 w-4 h-0.5 bg-gradient-to-r from-primary/40 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-t border-primary/20">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 mb-6">
                <Rocket className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Why Choose QueryNow</span>
              </div>
              <h2 className="text-5xl font-black mb-8 text-balance">
                Built for <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Everyone</span>
              </h2>
              <ul className="space-y-4">
                {benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-lg animate-fade-in" style={{ animationDelay: `${idx * 80}ms` }}>
                    <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-foreground font-medium">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative h-96 lg:h-full min-h-96 rounded-2xl border border-primary/30 bg-gradient-to-br from-card/50 to-card/20 backdrop-blur-md overflow-hidden animate-fade-in shadow-2xl" style={{ animationDelay: '300ms' }}>
  <div className="absolute inset-0 flex items-center justify-center p-4 lg:p-5">
    <video
      src={demoVideo}
      autoPlay
      muted
      playsInline
      className="w-full h-full object-cover rounded-sm shadow-2xl"
      id="hero-demo-video"
    />
  </div>


  
</div>
          </div>
        </div>
      </section>

      <section className="relative py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="p-12 sm:p-16 rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/20 via-background to-accent/10 backdrop-blur-lg animate-glow overflow-hidden relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 animate-float" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/10 rounded-full blur-3xl -z-10 animate-float" style={{ animationDelay: '1s' }} />

            <div className="relative z-10 text-center">
              <h2 className="text-5xl sm:text-6xl font-black mb-6 text-balance">
                Ready to Transform Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Documents?</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">Join thousands using Query for intelligent document processing and AI-powered insights</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <RegisterLink className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold hover:shadow-2xl hover:shadow-primary/50 transition-all duration-300 border border-primary/50">
                  Get Started Free
                </RegisterLink>
                <button
                  disabled
                  aria-disabled="true"
                  title="Pricing coming soon"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-primary/30 text-muted-foreground bg-primary/5 font-bold transition-all duration-300 opacity-50 cursor-not-allowed pointer-events-none"
                >
                 Pricing Coming Soon
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-32 px-4 sm:px-6 lg:px-8 border-t border-primary/20 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 animate-fade-in">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full border border-primary/30 bg-primary/10">
              <span className="text-sm font-semibold text-primary">Advanced Processing</span>
            </div>
            <h2 className="text-5xl sm:text-6xl font-black mb-4 text-balance">
              Multi-Document <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">RAG Processing</span>
            </h2>
            <p className="text-md text-muted-foreground max-w-2xl mx-auto">Watch multiple documents flow through our intelligent processing pipeline in real-time</p>
          </div>

          <div className="relative rounded-3xl border border-primary/30 bg-gradient-to-br from-card/50 to-card/20 backdrop-blur-md overflow-hidden min-h-96">
            <div className="absolute inset-0">
              <div className="absolute top-10 left-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-float" style={{ willChange: 'transform' }} />
              <div className="absolute bottom-10 right-10 w-56 h-56 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s', willChange: 'transform' }} />
            </div>

            <DocumentProcessor />
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {[
              { label: "Documents in Queue", value: "1,240", icon: Upload, delay: "0ms" },
              { label: "Processing Rate", value: "2.5K docs/min", icon: Zap, delay: "100ms" },
              { label: "Avg Latency", value: "45ms", icon: Brain, delay: "200ms" }
            ].map((stat, idx) => {
              const StatIcon = stat.icon
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-sm hover:border-primary/60 transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: stat.delay, willChange: 'transform' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <StatIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold text-primary">{stat.value}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
