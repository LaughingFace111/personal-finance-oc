import { createContext, useContext } from 'react'

interface AppUser {
  id: string
  email: string
  default_book_id: string
  nickname?: string
}

interface AuthContextType {
  token: string | null
  user: AppUser | null
  login: (token: string, user: AppUser) => void
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
