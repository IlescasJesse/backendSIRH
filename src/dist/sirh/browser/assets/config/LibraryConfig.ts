import { MatPaginatorIntl } from "@angular/material/paginator";

export function customMatPaginatorIntl() {
    const matPaginatorInitl: MatPaginatorIntl = new MatPaginatorIntl();

    matPaginatorInitl.itemsPerPageLabel = 'Filas por página';
    matPaginatorInitl.nextPageLabel = 'Siguiente página';
    matPaginatorInitl.previousPageLabel = 'Anterior página';
    matPaginatorInitl.getRangeLabel = (
        page: number,
        pageSize: number,
        length: number
    ) => {
        if (length == 0 || pageSize == 0 ){
            return `0 de ${length}`;
        }
        length = Math.max(length, 0);
        const starIndex = page * pageSize;
        const endIndex = 
            starIndex < length
            ? Math.min(starIndex + pageSize, length)
            : starIndex + pageSize;
        return `${starIndex + 1} a ${endIndex} de ${length}`
     }
    return matPaginatorInitl;
}