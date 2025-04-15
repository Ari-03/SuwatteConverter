import { ChangeEvent, useEffect, useState, useRef } from 'react'
import { SuwatteBackup, LibraryEntry, StoredContent, StoredChapter, ProgressMarker } from '@/@types/suwatte'
import { AidokuBackup, Library, Manga, Chapter, History } from '@/@types/aidoku'
import bplistCreator from 'bplist-creator'

interface AidokuResult {
  backup: AidokuBackup;
  dateString: string;
}

Date.prototype.toJSON = function () {
    return this.toISOString().slice(0,-5)+"Z"
}

export default function AidokuWrapper() {
  const [conversionSuccess, setConversionSuccess] = useState<boolean>(false)
  const [aidokuBinary, setAidokuBinary] = useState<Uint8Array>(new Uint8Array())
  const [newBackupName, setNewBackupName] = useState<string>('Aidoku.aib')
  const [consoleOutput, setConsoleOutput] = useState<string[]>(['> Ready.'])
  const consoleEndRef = useRef<HTMLDivElement | null>(null)
  
  const scrollToBottom = () => {
    consoleEndRef.current?.scrollIntoView({
      behavior: 'auto',
      block: 'nearest',
      inline: 'start'
    })
  }

  useEffect(scrollToBottom, [consoleOutput])

  async function toAidoku(suwatteBackup: SuwatteBackup): Promise<AidokuResult> {
    // Validate backup structure
    if (!suwatteBackup.library || !Array.isArray(suwatteBackup.library)) {
      throw new Error('Invalid backup: Missing library entries')
    }
    if (!suwatteBackup.storedContents || !Array.isArray(suwatteBackup.storedContents)) {
      throw new Error('Invalid backup: Missing manga content data')
    }

    const library: Library[] = []
    const manga: Manga[] = []
    const chapters: Chapter[] = []
    const history: History[] = []
    const sources = new Set<string>()
    const categories = new Set<string>()

    // Process library entries and content
    suwatteBackup.library.forEach((entry: LibraryEntry) => {
      const content = suwatteBackup.storedContents?.find(c => c.id === entry.id)
      if (!content) {
        console.warn(`Warning: No content found for library entry ${entry.id}`)
        return
      }

      // Convert dates to timestamps
      const lastUpdated = typeof entry.lastUpdated === 'string' 
        ? new Date(entry.lastUpdated).getTime() 
        : entry.lastUpdated instanceof Date 
          ? entry.lastUpdated.getTime() 
          : entry.lastUpdated || new Date().getTime()

      const dateAdded = typeof entry.dateAdded === 'string'
        ? new Date(entry.dateAdded).getTime()
        : entry.dateAdded instanceof Date
          ? entry.dateAdded.getTime()
          : entry.dateAdded || new Date().getTime()

      const lastOpened = typeof entry.lastOpened === 'string'
        ? new Date(entry.lastOpened).getTime()
        : entry.lastOpened instanceof Date
          ? entry.lastOpened.getTime()
          : entry.lastOpened || new Date().getTime()

      // Add to library
      library.push({
        mangaId: entry.id,
        lastUpdated,
        categories: entry.collections || [],
        dateAdded,
        sourceId: content.sourceId,
        lastOpened
      })

      // Add to manga
      manga.push({
        id: content.id,
        lastUpdate: lastUpdated,
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
      })

      // Add source
      sources.add(content.sourceId)

      // Add categories
      entry.collections.forEach(cat => categories.add(cat))
    })

    // Process chapters
    if (suwatteBackup.chapters) {
      suwatteBackup.chapters.forEach((chapter: StoredChapter) => {
        const dateUploaded = typeof chapter.date === 'string'
          ? new Date(chapter.date).getTime()
          : chapter.date instanceof Date
            ? chapter.date.getTime()
            : chapter.date || new Date().getTime()

        chapters.push({
          volume: chapter.volume,
          mangaId: chapter.contentId,
          lang: chapter.language || 'en',
          id: chapter.id || chapter.chapterId,
          scanlator: '',
          title: chapter.title || '',
          sourceId: chapter.sourceId,
          dateUploaded,
          chapter: chapter.number,
          sourceOrder: chapter.index || 0
        })
      })
    }

    // Process reading progress
    if (suwatteBackup.progressMarkers) {
      suwatteBackup.progressMarkers.forEach((progress: ProgressMarker) => {
        if (!progress.chapter) return
        
        const dateRead = progress.dateRead
          ? (typeof progress.dateRead === 'string'
            ? new Date(progress.dateRead).getTime()
            : progress.dateRead instanceof Date
              ? progress.dateRead.getTime()
              : progress.dateRead)
          : new Date().getTime()

        history.push({
          progress: progress.lastPageRead,
          mangaId: progress.chapter.contentId,
          chapterId: progress.chapter.chapterId,
          completed: progress.lastPageRead === progress.totalPageCount,
          sourceId: '', // We don't have this info in Suwatte progress markers
          dateRead,
          total: progress.totalPageCount
        })
      })
    }

    if (library.length === 0) {
      throw new Error('No valid library entries found in backup')
    }

    if (manga.length === 0) {
      throw new Error('No valid manga entries found in backup')
    }

    const aidokuBackup: AidokuBackup = {
      library,
      history,
      manga,
      chapters,
      sources: Array.from(sources),
      categories: Array.from(categories),
      date: new Date().getTime(),
      version: '1.0.0'
    }

    const dateString = new Date().toISOString().split('T')[0]
    return { backup: aidokuBackup, dateString }
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    event.preventDefault()

    setConsoleOutput(['> Starting...'])

    if (event.target.files == null) {
      setConsoleOutput((prevOutput: string[]) => [
        ...prevOutput,
        '> ERROR: No files were provided! Try reuploading?'
      ])
      return
    }

    setConsoleOutput((prevOutput: string[]) => [
      ...prevOutput,
      `> Your old backup name is: ${event.target.files![0].name}`
    ])

    let fr = new FileReader()

    fr.onload = async (e: ProgressEvent<FileReader>) => {
      if (e.target == null) {
        setConsoleOutput((prevOutput: string[]) => [
          ...prevOutput,
          '> ERROR: Something went wrong when parsing your backup, try uploading again.'
        ])
        return
      }

      try {
        const fileContent = e.target.result as string
        setConsoleOutput((prevOutput: string[]) => [
          ...prevOutput,
          '> Reading backup file...'
        ])

        const suwatteBackup = JSON.parse(fileContent) as SuwatteBackup
        setConsoleOutput((prevOutput: string[]) => [
          ...prevOutput,
          '> Successfully parsed Suwatte backup',
          `  Library entries: ${suwatteBackup.library?.length || 0}`,
          `  Manga entries: ${suwatteBackup.storedContents?.length || 0}`,
          `  Chapters: ${suwatteBackup.chapters?.length || 0}`,
          `  Progress markers: ${suwatteBackup.progressMarkers?.length || 0}`
        ])

        const backupResult = await toAidoku(suwatteBackup)
        const dateString = backupResult.dateString
        
        setConsoleOutput((prevOutput: string[]) => [
          ...prevOutput,
          '> Successfully converted to Aidoku format',
          `  Library entries: ${backupResult.backup.library.length}`,
          `  Manga entries: ${backupResult.backup.manga.length}`,
          `  Chapters: ${backupResult.backup.chapters.length}`,
          `  History entries: ${backupResult.backup.history.length}`,
          `  Sources: ${backupResult.backup.sources.length}`,
          `  Categories: ${backupResult.backup.categories?.length || 0}`
        ])

        // Convert to binary plist format
        const binaryPlist = bplistCreator(backupResult.backup)
        setAidokuBinary(new Uint8Array(binaryPlist))
        
        setNewBackupName(`Aidoku-${dateString}.aib`)
        setConsoleOutput((prevOutput: string[]) => [
          ...prevOutput,
          '> Conversion successful.',
          `  Your new backup name is: Aidoku-${dateString}.aib`
        ])

        getBlobLink()
        setConversionSuccess(true)
      } catch (error) {
        console.error(error)
        let errorMessage = '> ERROR: Failed to process backup.'
        if (error instanceof SyntaxError) {
          errorMessage += '\n  Invalid JSON format in backup file. Please make sure your backup file is a valid Suwatte backup.'
        } else {
          errorMessage += `\n  Details: ${error instanceof Error ? error.message : String(error)}`
          errorMessage += '\n  If this error persists, please check the browser console for more details.'
        }
        setConsoleOutput((prevOutput: string[]) => [
          ...prevOutput,
          errorMessage
        ])
      }
    }

    fr.readAsText(event.target.files[0])
  }

  function getBlobLink(): string {
    const blob = new Blob([aidokuBinary], { type: 'application/octet-stream' })
    return URL.createObjectURL(blob)
  }

  return (
    <div className="flex flex-col relative items-center justify-content-center">
      <p className="pb-5">Upload your Suwatte backup file to convert it to Aidoku format</p>
      <div>
        <label
          htmlFor="uploadSuwatte"
          className="border-solid border-2 text-lg border-red-300 p-2 rounded-md cursor-pointer hover:bg-red-300 hover:text-black duration-200 m-2">
          <strong>Suwatte Backup</strong>
        </label>
        <input
          type="file"
          id="uploadSuwatte"
          accept=".json"
          className="hidden"
          onChange={fileChanged}
        />
      </div>
      <h1 className="text-2xl pt-8">Console</h1>
      <ul className="bg-darkbg scrollbar-thin scrollbar-thumb-whitesmoke scrollbar-thumb-rounded scrollbar-track-darkbg my-3 h-52 w-full whitespace-pre-line overflow-y-scroll">
        {consoleOutput.map((output, index) => (
          <li key={index}>{output}</li>
        ))}
        <div ref={consoleEndRef} />
      </ul>
      {conversionSuccess && (
        <button className="border-solid border-2 text-lg border-white p-2 rounded-md cursor-pointer hover:bg-white hover:text-black duration-200">
          <a href={getBlobLink()} download={newBackupName}>
            Download
          </a>
        </button>
      )}
    </div>
  )
} 