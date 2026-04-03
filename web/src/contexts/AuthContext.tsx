import { createContext, useContext } from 'react'

interface AuthContextType {
  token: string | null
  user: any
  login: (token: string, user: any) => void
  logout: () => void
  loading: boolean
}

export const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  login: () => {},
  logout: () => {},
  loading: true,
})

export const useAuth = () => useContext(AuthContext)
