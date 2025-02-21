export interface MunkOptions {
    dir: string;
    outDir?: string;
    serverFileName?: string;
    clientFileName?: string;
    munkDir?: string;
}
declare function munk({ dir, outDir, serverFileName, clientFileName, munkDir, }: MunkOptions): Promise<void>;
export default munk;
