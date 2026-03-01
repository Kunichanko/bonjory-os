import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export interface PushPayload {
  title: string
  body: string
  url?: string
}

export interface SubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushNotification(
  sub: SubscriptionRecord,
  payload: PushPayload
): Promise<{ success: boolean; gone: boolean }> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    )
    return { success: true, gone: false }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 410 || statusCode === 404) return { success: false, gone: true }
    console.error('Push send error:', err)
    return { success: false, gone: false }
  }
}
