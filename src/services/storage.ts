import { supabase } from '@/lib/supabase'

const BUCKET = 'media'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export async function uploadImage(file: File, folder: 'teams' | 'players'): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${folder}/${Date.now()}-${randomId()}.${extension}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
