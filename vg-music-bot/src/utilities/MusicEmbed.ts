import {
  EmbedBuilder,
  type APIEmbed,
  type APIEmbedField,
  type EmbedAuthorOptions,
  type EmbedFooterOptions,
} from 'discord.js'
import { safeUrl, truncate, limitLines } from './MusicFormatting.js'

function text(value: string, limit: number): string {
  return (
    truncate(
      value
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim(),
      limit
    ) || '—'
  )
}
function fields(values: APIEmbedField[]): APIEmbedField[] {
  return values.slice(0, 25).map((field) => ({
    ...field,
    name: text(field.name, 256),
    value: text(field.value, 1024),
  }))
}

// Keeps the existing layout and colors. Bounds are enforced at construction and
// serialization so dynamic metadata cannot make Discord reject a music response.
export class MusicEmbed extends EmbedBuilder {
  setDescription(value: string | null): this {
    return super.setDescription(
      value === null
        ? null
        : text(value.length > 4096 ? limitLines(value.split('\n'), 4096) : value, 4096)
    )
  }
  setTitle(value: string | null): this {
    return super.setTitle(value === null ? null : text(value, 256))
  }
  setAuthor(value: EmbedAuthorOptions | null): this {
    return super.setAuthor(
      value && {
        ...value,
        name: text(value.name, 256),
        iconURL: safeUrl(value.iconURL) || undefined,
        url: safeUrl(value.url) || undefined,
      }
    )
  }
  setFooter(value: EmbedFooterOptions | null): this {
    return super.setFooter(
      value && {
        ...value,
        text: text(value.text, 2048),
        iconURL: safeUrl(value.iconURL) || undefined,
      }
    )
  }
  setImage(value: string | null): this {
    return super.setImage(safeUrl(value))
  }
  setThumbnail(value: string | null): this {
    return super.setThumbnail(safeUrl(value))
  }
  setURL(value: string | null): this {
    return super.setURL(safeUrl(value))
  }
  addFields(...values: Parameters<EmbedBuilder['addFields']>): this {
    return super.addFields(fields(values.flat()).slice(0, 25 - (this.data.fields?.length || 0)))
  }
  setFields(...values: Parameters<EmbedBuilder['setFields']>): this {
    return super.setFields(fields(values.flat()))
  }
  toJSON(): APIEmbed {
    const data = super.toJSON()
    let remaining = 6000
    const take = (value: string | undefined, limit: number) => {
      if (!value || remaining <= 0) return undefined
      const result = text(value, Math.min(limit, remaining))
      remaining -= result.length
      return result
    }
    data.title = take(data.title, 256)
    if (data.author) data.author = { ...data.author, name: take(data.author.name, 256) || '—' }
    data.description = take(data.description, 4096)
    const bounded: APIEmbedField[] = []
    for (const field of data.fields || []) {
      if (remaining < 2) break
      const name = take(field.name, Math.min(256, remaining - 1))!
      const value = take(field.value, 1024)!
      bounded.push({ ...field, name, value })
    }
    if (data.fields) data.fields = bounded
    if (data.footer) {
      const footer = take(data.footer.text, 2048)
      data.footer = footer ? { ...data.footer, text: footer } : undefined
    }
    return data
  }
}
