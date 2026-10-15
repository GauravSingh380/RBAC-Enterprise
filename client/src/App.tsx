import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ErrorBoundary } from './components/errors/ErrorBoundary'
import { router } from './router'
import { ThemeProvider } from './theme/ThemeProvider'

const App = () => {
  return (
    <ThemeProvider>
      {/* Last line of defence: anything not caught by page/route boundaries */}
      <ErrorBoundary variant="app">
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
