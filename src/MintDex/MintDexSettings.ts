import { DUISection, SourceStateManager } from '@paperback/types'

export const LANGUAGES: Record<string, string> = {
    'en': 'English',
    'es-la': 'Spanish (LatAm)',
    'es': 'Spanish',
    'pt-br': 'Portuguese (BR)',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'ru': 'Russian',
    'id': 'Indonesian',
    'vi': 'Vietnamese',
    'ar': 'Arabic',
    'tr': 'Turkish',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese (Simplified)',
    'zh-hk': 'Chinese (Traditional)'
}

export const RATINGS: Record<string, string> = {
    'safe': 'Safe',
    'suggestive': 'Suggestive',
    'erotica': 'Erotica',
    'pornographic': 'Pornographic'
}

const DEFAULT_LANGUAGES = ['en']
const DEFAULT_RATINGS = ['safe', 'suggestive']

export async function getLanguages(state: SourceStateManager): Promise<string[]> {
    const v = await state.retrieve('languages')
    return Array.isArray(v) && v.length ? v : DEFAULT_LANGUAGES
}

export async function getContentRatings(state: SourceStateManager): Promise<string[]> {
    const v = await state.retrieve('ratings')
    return Array.isArray(v) && v.length ? v : DEFAULT_RATINGS
}

export async function getDataSaver(state: SourceStateManager): Promise<boolean> {
    return (await state.retrieve('dataSaver')) === true
}

export function settingsSection(state: SourceStateManager): DUISection {
    return App.createDUISection({
        id: 'main',
        header: 'MintDex Settings',
        isHidden: false,
        rows: async () => [
            App.createDUISelect({
                id: 'languages',
                label: 'Chapter languages',
                options: Object.keys(LANGUAGES),
                allowsMultiselect: true,
                labelResolver: async (o: string) => LANGUAGES[o] ?? o,
                value: App.createDUIBinding({
                    get: () => getLanguages(state),
                    set: async (v: any) => { await state.store('languages', v) }
                })
            }),
            App.createDUISelect({
                id: 'ratings',
                label: 'Content ratings',
                options: Object.keys(RATINGS),
                allowsMultiselect: true,
                labelResolver: async (o: string) => RATINGS[o] ?? o,
                value: App.createDUIBinding({
                    get: () => getContentRatings(state),
                    set: async (v: any) => { await state.store('ratings', v) }
                })
            }),
            App.createDUISwitch({
                id: 'dataSaver',
                label: 'Data saver (smaller images)',
                value: App.createDUIBinding({
                    get: () => getDataSaver(state),
                    set: async (v: any) => { await state.store('dataSaver', v === true) }
                })
            })
        ]
    })
}
