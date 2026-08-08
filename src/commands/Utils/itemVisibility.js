const isVisibleItem = (item) => item?.show !== false;

const filterVisibleItems = (items = []) => items.filter(isVisibleItem);

module.exports = {
  isVisibleItem,
  filterVisibleItems,
};
