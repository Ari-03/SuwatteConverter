import { SuwatteBackup, StoredChapter, LibraryEntry, StoredContent, ProgressMarker, LibraryCollection, ContentLink } from '@/@types/suwatte';
import { AidokuBackup, History, Manga, Chapter, Library } from '@/@types/aidoku';
import { SetStateAction } from 'react'

interface AidokuResult {
  backup: AidokuBackup
  dateString: string
}

export default async function toAidoku(
  suwatteObj: SuwatteBackup,
  setConsoleOutput: (consoleOutput: SetStateAction<string[]>) => void
): Promise<AidokuResult | null> {
  if (!suwatteObj) return null;

  setConsoleOutput((consoleOutput) => [
    ...consoleOutput,
    "Processing SuwatteBackup object"
  ]);

  const aidokuBackup: AidokuBackup = {
    library: suwatteObj.library?.map(convertLibraryEntry) || [],
    history: suwatteObj.progressMarkers?.map(convertProgressMarker) || [],
    manga: suwatteObj.storedContents?.map(convertStoredContent) || [],
    chapters: suwatteObj.chapters?.map(convertStoredChapter) || [],
    sources: suwatteObj.contentLinks?.map(link => link.contentId) || [],
    date: suwatteObj.date?.getTime() || Date.now(),
    version: suwatteObj.appVersion || 'unknown',
    categories: suwatteObj.collections?.map(collection => collection.name) || []
  };

  setConsoleOutput((consoleOutput) => [
    ...consoleOutput,
    "Conversion complete"
  ]);

  return {
    backup: aidokuBackup,
    dateString: new Date(Date.now()).toISOString().split('T')[0]
  };
}

function convertLibraryEntry(entry: LibraryEntry): Library {
  return {
    mangaId: entry.id,
    lastUpdated: entry.lastUpdated.getTime(),
    categories: entry.collections,
    dateAdded: entry.dateAdded.getTime(),
    sourceId: entry.id,
    lastOpened: entry.lastOpened.getTime()
  };
}

function convertProgressMarker(marker: ProgressMarker): History {
  return {
    progress: marker.lastPageRead,
    mangaId: marker.chapter?.contentId || '',
    chapterId: marker.chapter?.chapterId || '',
    completed: marker.lastPageRead === marker.totalPageCount,
    sourceId: marker.chapter?.id || '',
    dateRead: marker.dateRead?.getTime() || Date.now(),
    total: marker.totalPageCount
  };
}

function convertStoredContent(content: StoredContent): Manga {
  return {
    id: content.id,
    lastUpdate: Date.now(),
    author: content.creators.join(', '),
    url: '',
    nsfw: content.isNSFW ? 1 : 0,
    tags: [],
    title: content.title,
    sourceId: content.sourceId,
    desc: content.summary,
    cover: content.cover,
    viewer: 0,
    status: content.status
  };
}

function convertStoredChapter(chapter: StoredChapter): Chapter {
  return {
    volume: chapter.volume,
    mangaId: chapter.contentId,
    lang: chapter.language || 'unknown',
    id: chapter.id || '',
    scanlator: '',
    title: chapter.title,
    sourceId: chapter.sourceId,
    dateUploaded: chapter.date.getTime(),
    chapter: chapter.number,
    sourceOrder: chapter.index || 0
  };
}