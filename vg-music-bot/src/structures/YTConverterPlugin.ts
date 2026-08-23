import { RainlinkTrack } from 'rainlink'
import { RainlinkPluginType } from 'rainlink'
import { RainlinkSearchOptions, RainlinkSearchResult, RainlinkSearchResultType } from 'rainlink'
import { Rainlink } from 'rainlink'
import { RainlinkPlugin as Plugin } from 'rainlink'

const YOUTUBE_REGEX = [
  /(?:https?:\/\/)?(?:www\.|music\.)?youtu(?:\.be\/|be.com\/\S*(?:watch|embed|v|shorts)(?:(?:(?=\/[-a-zA-Z0-9_]{11,}(?!\S))\/)|(?:\S*v=|v\/|embed\/|v\/|shorts\/)))([-a-zA-Z0-9_]{11,})/,
  /^.*(youtu.be\/|list=)([^#\&\?]*).*/,
]

export type YoutubeConvertOptions = {
  /**
   * The order of the source you want to search replaces YouTube, for example: scsearch, spsearch.
   * The more sources added, the slower the performance will be.
   */
  sources?: string[]
  /**
   * Whether to enable YouTube conversion to avoid suspension.
   */
  enabled?: boolean
}

export class RainlinkPlugin extends Plugin {
  private options: YoutubeConvertOptions
  private _search?: (
    query: string,
    options?: RainlinkSearchOptions
  ) => Promise<RainlinkSearchResult>
  constructor(options?: YoutubeConvertOptions) {
    super()
    this.options = options ?? { sources: ['scsearch'], enabled: false }
    if (!this.options.sources || this.options.sources.length == 0)
      this.options.sources = ['scsearch']
  }
  /** Name function for getting plugin name */
  public name(): string {
    return 'rainlink-youtubeConvert'
  }

  /** Type function for diferent type of plugin */
  public type(): RainlinkPluginType {
    return RainlinkPluginType.Default
  }

  /** Load function for make the plugin working */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public load(manager: Rainlink): void {
    this._search = manager.search.bind(manager)
    manager.search = this.search.bind(this)
  }

  /** unload function for make the plugin stop working */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public unload(manager: Rainlink): void {
    if (!this._search) return
    manager.search = this._search.bind(manager)
    this._search = undefined
  }

  private async search(
    query: string,
    options?: RainlinkSearchOptions
  ): Promise<RainlinkSearchResult> {
    // Check if search func avaliable
    if (!this._search) return this.buildSearch(undefined, [], RainlinkSearchResultType.SEARCH)

    const isUrl = /^https?:\/\//.test(query)
    const isYoutube = YOUTUBE_REGEX.some((match) => match.test(query))

    // Check if that's a yt link or just a generic link
    if (!isYoutube && !isUrl) return await this._search(query, options)

    // Get primary search query
    let preRes = await this._search(query, options)

    // Fallback for YouTube links that fail to resolve directly (often blocked on some nodes)
    if (preRes.tracks.length === 0 && isYoutube) {
      const idMatch = query.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([-a-zA-Z0-9_]{11})/
      )
      if (idMatch) {
        const searchRes = await this._search(`directSearch=ytsearch:${idMatch[1]}`, options)
        if (searchRes.tracks.length > 0) preRes = searchRes
      }
    }

    // Fallback for generic links that fail (try directSearch=http)
    if (preRes.tracks.length === 0 && isUrl && !isYoutube) {
      const httpRes = await this._search(`directSearch=http:${query}`, options)
      if (httpRes.tracks.length > 0) return httpRes
    }

    if (preRes.tracks.length === 0) return preRes

    // Only convert if it's a YouTube link and conversion is enabled
    if (isYoutube && this.options.enabled) {
      // Remove track encoded to trick rainlink (for playlists)
      if (preRes.type === RainlinkSearchResultType.PLAYLIST) {
        for (const track of preRes.tracks) {
          track.encoded = ''
        }
        return preRes
      }

      const song = preRes.tracks[0]
      const searchQuery = [song.author, song.title].filter((x) => !!x).join(' - ')
      const res = await this.searchEngine(searchQuery, options)
      if (res.tracks.length !== 0) return res
    }

    return preRes
  }

  private async searchEngine(
    query: string,
    options?: RainlinkSearchOptions
  ): Promise<RainlinkSearchResult> {
    if (!this._search) return this.buildSearch(undefined, [], RainlinkSearchResultType.SEARCH)
    for (const SearchParams of this.options.sources!) {
      const res = await this._search(`directSearch=${SearchParams}:${query}`, options)
      if (res.tracks.length !== 0) return res
    }
    return this.buildSearch(undefined, [], RainlinkSearchResultType.SEARCH)
  }

  private buildSearch(
    playlistName?: string,
    tracks: RainlinkTrack[] = [],
    type?: RainlinkSearchResultType
  ): RainlinkSearchResult {
    return {
      playlistName,
      tracks,
      type: type ?? RainlinkSearchResultType.SEARCH,
    }
  }
}
