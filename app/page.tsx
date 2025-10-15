import { RegisterLink, LoginLink } from "@kinde-oss/kinde-auth-nextjs/components"
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server"
import { redirect } from "next/navigation"

export default async function Home() {
  const { isAuthenticated } = getKindeServerSession()

  if (await isAuthenticated()) {
    redirect("/chat")
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="mb-20">
            <h1 className="text-6xl font-bold text-foreground mb-6 leading-tight">Query Now</h1>
            <p className="text-xl text-muted-foreground mb-6 max-w-2xl leading-relaxed">
              AI-powered document intelligence. Upload, process, and have intelligent conversations with your knowledge
              base.
            </p>
            <p className="text-base text-muted-foreground max-w-3xl leading-relaxed">
              Advanced embeddings, semantic search, and knowledge graphs work together to understand your documents
              deeply.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <LoginLink className="inline-flex items-center justify-center px-8 py-3 border border-border bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors">
                Sign In
              </LoginLink>
              <RegisterLink className="inline-flex items-center justify-center px-8 py-3 bg-secondary text-secondary-foreground font-medium rounded-lg border border-border hover:bg-secondary/80 transition-colors">
                Sign Up
              </RegisterLink>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mb-20">
            <div className="border border-border rounded-lg p-8 bg-card hover:border-primary/50 transition-colors">
              <div className="w-10 h-10 bg-primary/10 rounded-md flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Smart Upload</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upload PDF, DOCX, and TXT files with automatic text extraction and intelligent processing.
              </p>
            </div>
            <div className="border border-border rounded-lg p-8 bg-card hover:border-primary/50 transition-colors">
              <div className="w-10 h-10 bg-primary/10 rounded-md flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">AI Processing</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Advanced embeddings, knowledge graphs, and intelligent entity extraction for deep understanding.
              </p>
            </div>
            <div className="border border-border rounded-lg p-8 bg-card hover:border-primary/50 transition-colors">
              <div className="w-10 h-10 bg-primary/10 rounded-md flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Intelligent Chat</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ask questions and get contextual answers directly from your document knowledge base.
              </p>
            </div>
          </div>
          <div className="border border-border rounded-lg p-8 bg-card mb-16">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Processing Pipeline</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="text-center">
                <div className="bg-muted text-foreground px-3 py-2 rounded text-sm font-medium">Appwrite Storage</div>
              </div>
              <div className="text-center">
                <div className="bg-muted text-foreground px-3 py-2 rounded text-sm font-medium">OpenAI Embeddings</div>
              </div>
              <div className="text-center">
                <div className="bg-muted text-foreground px-3 py-2 rounded text-sm font-medium">Pinecone Vector DB</div>
              </div>
              <div className="text-center">
                <div className="bg-muted text-foreground px-3 py-2 rounded text-sm font-medium">
                  Neo4j Knowledge Graph
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Redis caching for lightning-fast queries and optimal performance.
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-center">Secure authentication powered by Kinde</p>
        </div>
      </div>
    </main>
  )
}
