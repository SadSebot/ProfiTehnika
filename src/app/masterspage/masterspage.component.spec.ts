import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MasterspageComponent } from './masterspage.component';

describe('MasterspageComponent', () => {
  let component: MasterspageComponent;
  let fixture: ComponentFixture<MasterspageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasterspageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MasterspageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
