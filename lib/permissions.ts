import supabase from './supabase'

export type PermissionKey =
  | 'course_management'
  | 'task_management'
  | 'point_settings'
  | 'submission_review'
  | 'finance'
  | 'timeline_management'

export const FEATURE_LIST: { id: PermissionKey; label: string; path: string; icon: string }[] = [
  { id: 'course_management',   label: '部員・コース管理', path: '/admin',            icon: '👥' },
  { id: 'task_management',     label: '課題管理',         path: '/admin/tasks',      icon: '📝' },
  { id: 'point_settings',      label: 'ポイント設定',     path: '/admin/points',     icon: '🏆' },
  { id: 'submission_review',   label: '提出状況',         path: '/admin/submissions',icon: '📊' },
  { id: 'finance',             label: '金の管理',         path: '/admin/finance',    icon: '💰' },
  { id: 'timeline_management', label: 'タイムライン管理', path: '/admin/timeline',   icon: '🎬' },
]

const EMPTY_PERMS: Record<PermissionKey, boolean> = {
  course_management:   false,
  task_management:     false,
  point_settings:      false,
  submission_review:   false,
  finance:             false,
  timeline_management: false,
}

/** 指定ユーザーの有効な権限（全役職の OR）を返す */
export async function getEffectivePermissions(
  userId: string
): Promise<Record<PermissionKey, boolean>> {
  const base = { ...EMPTY_PERMS }
  const { data } = await supabase
    .from('profile_positions')
    .select('positions(permissions)')
    .eq('profile_id', userId)
  data?.forEach(pp => {
    const perms = (pp as { positions: { permissions: Record<string, boolean> } | null }).positions?.permissions ?? {}
    ;(Object.keys(base) as PermissionKey[]).forEach(k => {
      if (perms[k]) base[k] = true
    })
  })
  return base
}
