export default function BrandSuggestions({ suggestions, activeIndex, listboxId, onSelect }) {
  return (
    <ul className="brand-suggestions" id={listboxId} role="listbox" aria-label="브랜드 검색 후보">
      {suggestions.map((brand, index) => (
        <li role="none" key={brand.name}>
          <button
            type="button"
            id={`${listboxId}-option-${index}`}
            className={`brand-suggestions__option${index === activeIndex ? ' brand-suggestions__option--active' : ''}`}
            role="option"
            aria-selected={index === activeIndex}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onSelect(index)}
          >
            {brand.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
