/**
 * Dynamic icon renderer using lucide-react.
 * Used for rendering icons stored as string names in data objects (e.g. FEATURE_LIST).
 */
import {
  AlertTriangle, ArrowRight, BarChart2, Bell, BellOff, BookOpen, Bot,
  Bug, Calendar, Check, CheckCircle2, CheckSquare, ChevronRight,
  ClipboardList, Crown, DollarSign, FileText, Film, Flame, Flower,
  Gamepad2, Globe, Image, Inbox, LayoutGrid, Lightbulb, Link2,
  LogOut, Mail, MailOpen, Medal, Megaphone, Menu, MessageCircle,
  Newspaper, Package, Palette, PartyPopper, Pin, Plus, RefreshCw,
  Repeat, Rocket, ScrollText, Search, Send, Settings, Shield,
  Smartphone, Sparkles, Star, Tag, Target, Theater, Trash2,
  TrendingDown, Trophy, User, Users, Wrench, X, Zap,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

const ICON_MAP: Record<string, FC<LucideProps>> = {
  AlertTriangle, ArrowRight, BarChart2, Bell, BellOff, BookOpen, Bot,
  Bug, Calendar, Check, CheckCircle2, CheckSquare, ChevronRight,
  ClipboardList, Crown, DollarSign, FileText, Film, Flame, Flower,
  Gamepad2, Globe, Image, Inbox, LayoutGrid, Lightbulb, Link2,
  LogOut, Mail, MailOpen, Medal, Megaphone, Menu, MessageCircle,
  Newspaper, Package, Palette, PartyPopper, Pin, Plus, RefreshCw,
  Repeat, Rocket, ScrollText, Search, Send, Settings, Shield,
  Smartphone, Sparkles, Star, Tag, Target, Theater, Trash2,
  TrendingDown, Trophy, User, Users, Wrench, X, Zap,
}

interface IconProps extends LucideProps {
  name: string
}

export default function Icon({ name, ...props }: IconProps) {
  const Component = ICON_MAP[name]
  if (!Component) return null
  return <Component {...props} />
}
