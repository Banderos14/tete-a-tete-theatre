import styles from './LeafletMap.module.scss';

const MAP_SRC = 'https://www.google.com/maps?q=24%20Rue%20Rossini%2C%2006000%20Nice%2C%20France&t=k&z=17&output=embed';

export function LeafletMap() {
  return (
    <div className={styles.mapShell}>
      <iframe
        className={styles.map}
        src={MAP_SRC}
        title="24 Rue Rossini, 06000 Nice, France"
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}
