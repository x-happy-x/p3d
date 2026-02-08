type Props = {
  roomCount: number;
  totalArea: number;
};

export default function StatsBar({ roomCount, totalArea }: Props) {
  return (
    <div className="stats">
      <div>
        <span className="label">Всего комнат</span>
        <span className="value">{roomCount}</span>
      </div>
      <div>
        <span className="label">Общая площадь</span>
        <span className="value">{totalArea.toFixed(2)} м²</span>
      </div>
    </div>
  );
}
