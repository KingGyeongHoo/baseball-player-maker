import type {Game,Position} from "./types";
export type AllstarLevel="first"|"second";
export type AllstarSide="blue"|"white";
export type AllstarCandidate={playerId:string;name:string;club:number;slot:Position;votes:number;nominated:boolean};
export type AllstarMember={playerId:string;name:string;club:number;slot:Position;method:"vote"|"manager"|"replacement";replacementFor?:string};
export type AllstarSelection={year:number;level:AllstarLevel;side:AllstarSide;slot:Position;method:AllstarMember["method"];participated?:boolean;mvp?:boolean;withdrawn?:boolean};
export type AllstarTeam={ballots:Partial<Record<Position,AllstarCandidate[]>>;roster:AllstarMember[];withdrawn:string[]};
export type AllstarLeague={blue:AllstarTeam;white:AllstarTeam;prepared?:boolean;resultShown?:boolean;game?:Game;mvp?:{playerId:string;name:string;side:AllstarSide;merit:number};cancelled?:string};
export type ProAllstarSeason={version:1;year:number;introducedAt:string;lastUpdated?:string;finalizedAt?:string;skipped?:boolean;levels:Record<AllstarLevel,AllstarLeague>};
