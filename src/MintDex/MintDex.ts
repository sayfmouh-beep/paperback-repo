import {
    Chapter,
    ChapterDetails,
    ChapterProviding,
    ContentRating,
    DUISection,
    HomePageSectionsProviding,
    HomeSection,
    HomeSectionType,
    MangaProviding,
    PagedResults,
    PartialSourceManga,
    Request,
    Response,
    SearchRequest,
    SearchResultsProviding,
    SourceInfo,
    SourceIntents,
    SourceManga,
    TagSection
} from '@paperback/types'

import {
    getContentRatings,
    getDataSaver,
    getLanguages,
    settingsSection
} from './MintDexSettings'

const API = 'https://api.mangadex.org'
const COVERS = 'https://uploads.mangadex.org/covers'
const SITE = 'https://mangadex.org'
const PAGE_SIZE = 32
const FEED_SIZE = 500

export const MintDexInfo: SourceInfo = {
    version: '1.0.0',
    name: 'MintDex',
    icon: 'icon.png',
    author: 'Mint',
    authorWebsite: 'https://mangadex.org',
    description: "Sayf's own MangaDex extension, built and maintained by Mint.",
    contentRating: ContentRating.MATURE,
    websiteBaseURL: SITE,
    language: 'Multi',
    sourceTags: [],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.SETTINGS_UI
}

export class MintDex implements SearchResultsProviding, MangaProviding, ChapterProviding, HomePageSectionsProviding {
    stateManager = App.createSourceStateManager()

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 20000
    })

    // ---------- helpers ----------

    private async getJSON(url: string): Promise<any> {
        const request = App.createRequest({ url, method: 'GET' })
        const response = await this.requestManager.schedule(request, 2)
        if (response.status === 429) throw new Error('MangaDex rate limit hit — wait a few seconds and try again.')
        if (response.status >= 400) throw new Error(`MangaDex returned HTTP ${response.status} for ${url}`)
        try {
            return typeof response.data === 'string' ? JSON.parse(response.data) : response.data
        } catch {
            throw new Error('Could not read MangaDex response.')
        }
    }

    private qs(params: Record<string, string | number | string[] | undefined>): string {
        const parts: string[] = []
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === '') continue
            if (Array.isArray(value)) {
                for (const v of value) parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(v)}`)
            } else {
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
            }
        }
        return parts.join('&')
    }

    private pickTitle(attributes: any): string {
        const titles = attributes?.title ?? {}
        if (titles.en) return titles.en
        const alt = (attributes?.altTitles ?? []).find((t: any) => t.en)
        if (alt) return alt.en
        const first = Object.values(titles)[0]
        return typeof first === 'string' ? first : 'Untitled'
    }

    private coverUrl(manga: any, size: '256' | '512' | 'full' = '512'): string {
        const cover = (manga.relationships ?? []).find((r: any) => r.type === 'cover_art')
        const file = cover?.attributes?.fileName
        if (!file) return ''
        return size === 'full' ? `${COVERS}/${manga.id}/${file}` : `${COVERS}/${manga.id}/${file}.${size}.jpg`
    }

    private toTile(manga: any, subtitle?: string): PartialSourceManga {
        return App.createPartialSourceManga({
            mangaId: manga.id,
            title: this.pickTitle(manga.attributes),
            image: this.coverUrl(manga, '256'),
            subtitle
        })
    }

    private async listParams(): Promise<Record<string, string | string[]>> {
        return {
            'contentRating': await getContentRatings(this.stateManager),
            'availableTranslatedLanguage': await getLanguages(this.stateManager),
            'includes': ['cover_art'],
            'hasAvailableChapters': 'true'
        }
    }

    private async mangaList(extra: Record<string, any>, offset: number): Promise<{ tiles: PartialSourceManga[], total: number }> {
        const params = { ...(await this.listParams()), ...extra, limit: PAGE_SIZE, offset }
        const json = await this.getJSON(`${API}/manga?${this.qs(params)}`)
        const tiles = (json.data ?? []).map((m: any) => this.toTile(m))
        return { tiles, total: json.total ?? 0 }
    }

    // ---------- settings ----------

    async getSourceMenu(): Promise<DUISection> {
        return settingsSection(this.stateManager)
    }

    // ---------- manga ----------

    getMangaShareUrl(mangaId: string): string {
        return `${SITE}/title/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const url = `${API}/manga/${mangaId}?${this.qs({ includes: ['author', 'artist', 'cover_art'] })}`
        const json = await this.getJSON(url)
        const manga = json.data
        const a = manga.attributes

        const people = (type: string) => (manga.relationships ?? [])
            .filter((r: any) => r.type === type)
            .map((r: any) => r.attributes?.name)
            .filter(Boolean)
            .join(', ')

        const titles: string[] = [this.pickTitle(a)]
        for (const alt of a.altTitles ?? []) {
            for (const t of Object.values(alt)) {
                if (typeof t === 'string' && !titles.includes(t)) titles.push(t)
            }
        }

        const status: Record<string, string> = {
            ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus', cancelled: 'Cancelled'
        }

        const tags = (a.tags ?? []).map((t: any) => App.createTag({
            id: t.id,
            label: t.attributes?.name?.en ?? 'Tag'
        }))

        const desc = a.description?.en ?? Object.values(a.description ?? {})[0] ?? ''

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image: this.coverUrl(manga, '512'),
                author: people('author'),
                artist: people('artist'),
                desc: String(desc),
                status: status[a.status] ?? 'Unknown',
                hentai: a.contentRating === 'pornographic',
                tags: [App.createTagSection({ id: 'tags', label: 'Tags', tags })]
            })
        })
    }

    // ---------- chapters ----------

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const languages = await getLanguages(this.stateManager)
        const ratings = await getContentRatings(this.stateManager)
        const raw: any[] = []
        let offset = 0
        let total = 1

        while (offset < total) {
            const params = {
                'translatedLanguage': languages,
                'contentRating': ratings,
                'includes': ['scanlation_group'],
                'order[volume]': 'desc',
                'order[chapter]': 'desc',
                'includeFutureUpdates': '0',
                limit: FEED_SIZE,
                offset
            }
            const json = await this.getJSON(`${API}/manga/${mangaId}/feed?${this.qs(params)}`)
            raw.push(...(json.data ?? []))
            total = json.total ?? 0
            offset += FEED_SIZE
            if ((json.data ?? []).length === 0) break
        }

        const chapters: Chapter[] = []
        let index = 0
        for (const ch of raw) {
            const a = ch.attributes
            // Skip chapters MangaDex only links out to (official sites) and empty ones.
            if (a.externalUrl || !a.pages) continue
            const group = (ch.relationships ?? [])
                .filter((r: any) => r.type === 'scanlation_group')
                .map((r: any) => r.attributes?.name)
                .filter(Boolean)
                .join(', ')
            const chapNum = Number(a.chapter)
            chapters.push(App.createChapter({
                id: ch.id,
                chapNum: isNaN(chapNum) ? 0 : chapNum,
                volume: a.volume ? Number(a.volume) || 0 : 0,
                name: a.title ?? '',
                group: group || 'No group',
                langCode: a.translatedLanguage ?? 'en',
                time: new Date(a.publishAt ?? a.readableAt ?? Date.now()),
                sortingIndex: raw.length - index
            }))
            index++
        }
        return chapters
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const json = await this.getJSON(`${API}/at-home/server/${chapterId}`)
        const saver = await getDataSaver(this.stateManager)
        const base = json.baseUrl
        const hash = json.chapter?.hash
        const files: string[] = saver ? (json.chapter?.dataSaver ?? []) : (json.chapter?.data ?? [])
        const folder = saver ? 'data-saver' : 'data'
        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages: files.map(f => `${base}/${folder}/${hash}/${f}`)
        })
    }

    // ---------- search ----------

    async getSearchTags(): Promise<TagSection[]> {
        const json = await this.getJSON(`${API}/manga/tag`)
        const groups: Record<string, any[]> = {}
        for (const t of json.data ?? []) {
            const group = t.attributes?.group ?? 'other'
            ;(groups[group] = groups[group] ?? []).push(App.createTag({
                id: t.id,
                label: t.attributes?.name?.en ?? 'Tag'
            }))
        }
        return Object.entries(groups).map(([id, tags]) => App.createTagSection({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            tags: tags.sort((x, y) => x.label.localeCompare(y.label))
        }))
    }

    async supportsTagExclusion(): Promise<boolean> {
        return true
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const offset: number = metadata?.offset ?? 0
        const title = (query.title ?? '').trim()

        // Paste a MangaDex link or ID to jump straight to that title.
        const idMatch = title.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        if (idMatch && offset === 0) {
            const json = await this.getJSON(`${API}/manga/${idMatch[0]}?${this.qs({ includes: ['cover_art'] })}`)
            return App.createPagedResults({ results: json.data ? [this.toTile(json.data)] : [] })
        }

        const extra: Record<string, any> = {
            'title': title || undefined,
            'includedTags': (query.includedTags ?? []).map(t => t.id),
            'excludedTags': (query.excludedTags ?? []).map(t => t.id),
            'includedTagsMode': 'AND',
            'excludedTagsMode': 'OR'
        }
        if (title) extra['order[relevance]'] = 'desc'
        else extra['order[followedCount]'] = 'desc'

        const { tiles, total } = await this.mangaList(extra, offset)
        const next = offset + PAGE_SIZE
        return App.createPagedResults({
            results: tiles,
            metadata: next < total && next < 10000 ? { offset: next } : undefined
        })
    }

    // ---------- home ----------

    private readonly sections: { id: string, title: string, type: HomeSectionType, order: Record<string, string> }[] = [
        { id: 'popular', title: 'Popular', type: HomeSectionType.featured, order: { 'order[followedCount]': 'desc' } },
        { id: 'latest', title: 'Latest Updates', type: HomeSectionType.singleRowNormal, order: { 'order[latestUploadedChapter]': 'desc' } },
        { id: 'rated', title: 'Top Rated', type: HomeSectionType.singleRowNormal, order: { 'order[rating]': 'desc' } },
        { id: 'new', title: 'Recently Added', type: HomeSectionType.singleRowNormal, order: { 'order[createdAt]': 'desc' } }
    ]

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const promises = this.sections.map(async s => {
            const section = App.createHomeSection({ id: s.id, title: s.title, type: s.type, containsMoreItems: true })
            sectionCallback(section)
            const { tiles } = await this.mangaList(s.order, 0)
            section.items = tiles
            sectionCallback(section)
        })
        await Promise.all(promises)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const offset: number = metadata?.offset ?? 0
        const s = this.sections.find(x => x.id === homepageSectionId)
        if (!s) return App.createPagedResults({ results: [] })
        const { tiles, total } = await this.mangaList(s.order, offset)
        const next = offset + PAGE_SIZE
        return App.createPagedResults({
            results: tiles,
            metadata: next < total && next < 10000 ? { offset: next } : undefined
        })
    }
}
