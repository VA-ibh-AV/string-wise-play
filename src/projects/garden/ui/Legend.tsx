/** Always-on colour key: the one thing people ask first. */
export function Legend() {
  return (
    <div className="g-legend-mini" aria-label="Colour key">
      <span><i style={{ background: '#FFB24A' }} />request</span>
      <span><i style={{ background: '#5FDDE6' }} />answer</span>
      <span><i style={{ background: '#B8F06C' }} />from Nebula</span>
      <span><i style={{ background: '#FF7B8F' }} />lost</span>
      <span><i className="ring" style={{ borderColor: '#B89DFF' }} />routing news</span>
    </div>
  );
}
