export interface TodoData {
  date: string;
  completed: number;
}

export interface ZenTimeData {
  activity: string;
  minutes: number;
}

export interface ProgressData {
  day: string;
  score: number;
}

export interface PieArcDatum extends d3.PieArcDatum<ZenTimeData> {
  data: ZenTimeData;
}
