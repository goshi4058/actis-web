import { useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "../../firebase/config"
import { isAdminUser } from "../../utils/admin"

// ログイン中ユーザーと管理者フラグ
export function useAuthUser() {
  const [user, setUser] = useState(() => auth.currentUser)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  return { user, isAdmin: isAdminUser(user) }
}
